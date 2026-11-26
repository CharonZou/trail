import type { KnowledgeDocument, KnowledgeLibrary } from "@trail/shared";

/**
 * Per-document health. This is the Trail counterpart of EvoFlow's
 * `computeDocHealth`: every deduction maps to a state Trail can actually
 * observe, so the reader never shows an invented score.
 */
export type DocHealthTone = "ok" | "warn" | "err";

export type DocHealthHint =
  | "failed"
  | "noChunks"
  | "pendingVectors"
  | "noHeadings"
  | "stale";

export type DocHealth = {
  score: number;
  tone: DocHealthTone;
  hints: DocHealthHint[];
};

type HealthInput = {
  document: KnowledgeDocument;
  library: KnowledgeLibrary;
  /** Headings found in the stored body (from `docStats`). */
  headings: number;
  /** Injectable clock so the stale check is testable. */
  now?: number;
};

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function docHealth({
  document,
  library,
  headings,
  now = Date.now(),
}: HealthInput): DocHealth {
  let score = 100;
  const hints: DocHealthHint[] = [];

  if (document.status === "failed") {
    score -= 60;
    hints.push("failed");
  }
  if (document.chunkCount === 0) {
    score -= 30;
    hints.push("noChunks");
  } else if (library.semanticEnabled && library.vectorPendingDocumentCount > 0) {
    // The pending count is library-wide, but it is the only vector signal the
    // host exposes today; the rail labels it as library state, not doc state.
    score -= 10;
    hints.push("pendingVectors");
  }
  if (headings === 0) {
    score -= 5;
    hints.push("noHeadings");
  }
  const updated = new Date(document.updatedAt).getTime();
  if (Number.isFinite(updated) && now - updated > STALE_AFTER_MS) {
    score -= 5;
    hints.push("stale");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tone: DocHealthTone = score >= 85 ? "ok" : score >= 60 ? "warn" : "err";
  return { score, tone, hints };
}
