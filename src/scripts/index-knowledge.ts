import { indexSharedKnowledge } from "../services/knowledge.service";
import { logger } from "../utils/logger";

function safeReason(error: unknown): string {
  const text = error instanceof Error ? error.message : "failed";
  return text.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 200);
}

indexSharedKnowledge()
  .then((result) => {
    logger.info("knowledge_index_ready", { files: result.files, chunks: result.chunks });
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error("knowledge_index_failed", { reason: safeReason(error) });
    process.exit(1);
  });
