import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google/node";
import { env, isAssistantConfigured } from "../config/env";
import { logger } from "../utils/logger";
import { shouldSearchSharedKnowledge } from "./knowledge-text";
import { searchSharedKnowledge } from "./knowledge.service";
import { normalizeLyzrPayload, type NormalizedLyzrTurn } from "./lyzr.service";

const HISTORY_LIMIT = 12;

export class AssistantResponseError extends Error {
  constructor() {
    super("Unexpected assistant response");
    this.name = "AssistantResponseError";
  }
}

function isThought(part: object): boolean {
  return ("thought" in part && part.thought === true) || ("type" in part && part.type === "thinking");
}

function replyText(content: unknown): string {
  if (typeof content === "string") return spokenReply(content);
  if (!Array.isArray(content)) return "";
  return spokenReply(
    content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object" || isThought(part)) return "";
        if ("text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join(""),
  );
}

function spokenReply(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const spoken = paragraphs.filter((paragraph) => !isPlanning(paragraph));
  return (spoken.length > 0 ? spoken : paragraphs).join("\n\n").trim();
}

function isPlanning(paragraph: string): boolean {
  return /^(?:\*\*[^*\n]+\*\*|#|okay,|first,|next,|finally,|my approach|i need to|i'll |i will |let's make sure|as i mentioned)/i.test(
    paragraph,
  );
}

function instructions(passages: string[], listUnavailable: boolean): string {
  const rules = [
    "You are a patient navigator. You organize information and the next practical step.",
    "You do not diagnose, recommend treatment, prescribe, or decide insurance coverage.",
    "You do not invent hospitals, doctors, or appointment slots.",
    "Write only the reply the patient should read. Do not write a plan, a heading, or your reasoning.",
    "Use at most four short sentences, and ask one question about one missing detail.",
    "If reference passages are included, name at most two hospitals or doctors from those passages.",
  ];
  if (listUnavailable) {
    rules.push("The shared hospital and doctor list could not be searched. Do not name a hospital or doctor.");
  } else if (passages.length > 0) {
    rules.push("Name a hospital or doctor only when it appears in the shared reference passages below.");
    rules.push(passages.map((passage, index) => `${index + 1}. ${passage}`).join("\n\n"));
  }
  return rules.join("\n\n");
}

export async function sendMessageToAssistant(input: {
  history: Array<{ role: "patient" | "assistant"; content: string }>;
  question: string;
  message: string;
}): Promise<NormalizedLyzrTurn> {
  if (!isAssistantConfigured()) {
    logger.warn("assistant_not_configured");
    throw new AssistantResponseError();
  }

  let passages: string[] = [];
  let listUnavailable = false;
  if (shouldSearchSharedKnowledge(input.question)) {
    try {
      passages = await searchSharedKnowledge(input.question);
      listUnavailable = passages.length === 0;
    } catch {
      logger.warn("knowledge_search_failed");
      listUnavailable = true;
    }
  }

  const history = input.history.slice(-HISTORY_LIMIT).map((message) =>
    message.role === "patient" ? new HumanMessage(message.content) : new AIMessage(message.content),
  );
  const model = new ChatGoogle({
    model: "gemini-3.5-flash-lite",
    apiKey: env.GEMINI_API_KEY,
    temperature: 0.2,
    maxOutputTokens: 1024,
    thinkingLevel: "MINIMAL",
  });

  let response;
  try {
    response = await model.invoke(
      [
        new SystemMessage(instructions(passages, listUnavailable)),
        ...history,
        new HumanMessage(input.message),
      ],
      { signal: AbortSignal.timeout(45_000) },
    );
  } catch {
    logger.warn("assistant_request_failed");
    throw new AssistantResponseError();
  }

  const text = replyText(response.content);
  if (!text) throw new AssistantResponseError();

  try {
    return normalizeLyzrPayload({ response: text });
  } catch {
    return { message: text, intake: null };
  }
}
