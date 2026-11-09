import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Document } from "@langchain/core/documents";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PineconeStore } from "@langchain/pinecone";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Pinecone } from "@pinecone-database/pinecone";
import { extractText, getDocumentProxy } from "unpdf";
import { env, isKnowledgeConfigured } from "../config/env";
import { logger } from "../utils/logger";
import { shouldSearchSharedKnowledge } from "./knowledge-text";

const KNOWLEDGE_ROOT = path.resolve(process.cwd(), "data", "knowledge");
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSION = 768;
const MIN_MATCH_SCORE = 0.45;
const MATCH_LIMIT = 4;

export interface KnowledgeIndexResult {
  files: number;
  chunks: number;
}

function embeddings(): GoogleGenerativeAIEmbeddings {
  return new GoogleGenerativeAIEmbeddings({
    apiKey: env.GEMINI_API_KEY,
    model: EMBEDDING_MODEL,
    outputDimensionality: EMBEDDING_DIMENSION,
  });
}

function pinecone(): Pinecone {
  return new Pinecone({ apiKey: env.PINECONE_API_KEY });
}

async function readPdfText(filePath: string): Promise<string> {
  const bytes = new Uint8Array(await readFile(filePath));
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: true });
  const raw = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
  return raw.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function ensureIndex(): Promise<void> {
  const client = pinecone();
  const listed = await client.listIndexes();
  const existing = listed.indexes?.find((index) => index.name === env.PINECONE_INDEX);
  if (!existing) {
    await client.createIndex({
      name: env.PINECONE_INDEX,
      dimension: EMBEDDING_DIMENSION,
      metric: "cosine",
      spec: { serverless: { cloud: "aws", region: "us-east-1" } },
      waitUntilReady: true,
    });
    return;
  }

  const described = await client.describeIndex(env.PINECONE_INDEX);
  if (described.dimension !== EMBEDDING_DIMENSION) {
    throw new Error("The Pinecone index dimension does not match the embedding model.");
  }
}

export async function indexSharedKnowledge(directory = KNOWLEDGE_ROOT): Promise<KnowledgeIndexResult> {
  if (!isKnowledgeConfigured() || env.GEMINI_API_KEY.trim().length === 0) {
    throw new Error("Gemini and Pinecone keys are required before indexing shared knowledge.");
  }

  const names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".pdf"));
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 120 });
  const documents: Document[] = [];

  for (const name of names) {
    const text = await readPdfText(path.join(directory, name));
    if (!text) continue;
    const chunks = await splitter.splitText(text);
    for (const chunk of chunks) {
      documents.push(new Document({ pageContent: chunk, metadata: { source: name } }));
    }
  }

  if (documents.length === 0) {
    throw new Error("No readable PDF text was found in the shared knowledge folder.");
  }

  await ensureIndex();
  const client = pinecone();
  const index = client.index(env.PINECONE_INDEX);
  try {
    await index.deleteAll();
  } catch {
    logger.warn("knowledge_index_clear_skipped");
  }

  const store = await PineconeStore.fromExistingIndex(embeddings(), { pineconeIndex: index });
  const batchSize = 20;
  for (let start = 0; start < documents.length; start += batchSize) {
    await store.addDocuments(documents.slice(start, start + batchSize));
  }

  return { files: names.length, chunks: documents.length };
}

export async function searchSharedKnowledge(question: string): Promise<string[]> {
  if (!shouldSearchSharedKnowledge(question) || !isKnowledgeConfigured() || env.GEMINI_API_KEY.trim().length === 0) {
    return [];
  }

  const index = pinecone().index(env.PINECONE_INDEX);
  const store = await PineconeStore.fromExistingIndex(embeddings(), { pineconeIndex: index });
  const matches = await store.similaritySearchWithScore(question, MATCH_LIMIT);
  return matches
    .filter(([, score]) => score >= MIN_MATCH_SCORE)
    .map(([document]) => document.pageContent.trim())
    .filter((passage) => passage.length > 0);
}
