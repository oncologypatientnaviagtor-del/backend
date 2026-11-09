import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/patient-navigator"),
  CLIENT_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  LYZR_API_KEY: z.string().default(""),
  LYZR_AGENT_ID: z.string().default(""),
  LYZR_BASE_URL: z.string().min(1).default("https://agent-prod.studio.lyzr.ai"),
  GEMINI_API_KEY: z.string().default(""),
  PINECONE_API_KEY: z.string().default(""),
  PINECONE_INDEX: z.string().default("navigator-knowledge"),
  NEO4J_URI: z.string().default(""),
  NEO4J_USERNAME: z.string().default(""),
  NEO4J_PASSWORD: z.string().default(""),
  NEO4J_DATABASE: z.string().default("neo4j"),
});

export const env = envSchema.parse(process.env);

export function isLyzrConfigured(): boolean {
  return env.LYZR_API_KEY.trim().length > 0 && env.LYZR_AGENT_ID.trim().length > 0;
}

export function isAssistantConfigured(): boolean {
  return env.GEMINI_API_KEY.trim().length > 0;
}

export function isKnowledgeConfigured(): boolean {
  return env.PINECONE_API_KEY.trim().length > 0 && env.PINECONE_INDEX.trim().length > 0;
}
