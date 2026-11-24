import type { KnowledgeLibrary } from "@trail/shared";

/** Visual state of a single library row's status dot. */
export type LibraryStatus = "ready" | "processing" | "attention" | "empty" | "degraded";

export type HealthTone = "ok" | "warn" | "err";

export type HealthLabel =
  | "ok"
  | "empty"
  | "indexing"
  | "degraded"
  | "partialFailure"
  | "heavyFailure";

export type HealthHint =
  | { kind: "failed"; count: number }
  | { kind: "processing"; count: number }
  | { kind: "degraded"; count: number }
  | { kind: "keywordOnly"; count: number };

export type AggregateHealth = {
  score: number;
  tone: HealthTone;
  label: HealthLabel;
  hints: HealthHint[];
  ready: number;
  total: number;
  processing: number;
  failed: number;
  keywordOnly: number;
  degraded: number;
};

/**
 * A library is "degraded" when semantic search was enabled but some searchable
 * chunks still have no vector while no document is waiting in the pending
 * bucket — i.e. the index is incomplete but nothing is actively running.
 */
export function isVectorDegraded(library: KnowledgeLibrary): boolean {
  return (
    library.semanticEnabled &&
    library.vectorPendingDocumentCount === 0 &&
    library.embeddedChunkCount < library.chunkCount
  );
}

export function libraryStatus(library: KnowledgeLibrary): LibraryStatus {
  if (library.failedDocumentCount > 0) return "attention";
  if (library.semanticEnabled && library.vectorPendingDocumentCount > 0) return "processing";
  if (library.documentTotal === 0) return "empty";
  if (isVectorDegraded(library)) return "degraded";
  return "ready";
}

/**
 * Aggregates the same signals EvoFlow's knowledge hub shows: readiness ratio,
 * a penalty for failed and still-processing documents, and the number of
 * libraries that fell back to keyword search.
 */
export function aggregateHealth(libraries: KnowledgeLibrary[]): AggregateHealth {
  let ready = 0;
  let total = 0;
  let processing = 0;
  let failed = 0;
  let keywordOnly = 0;
  let degraded = 0;

  for (const library of libraries) {
    ready += library.documentCount;
    total += library.documentTotal;
    failed += library.failedDocumentCount;
    processing += library.semanticEnabled ? library.vectorPendingDocumentCount : 0;
    if (!library.semanticEnabled) keywordOnly += 1;
    if (isVectorDegraded(library)) degraded += 1;
  }

  if (total === 0) {
    return {
      score: 100,
      tone: "ok",
      label: "empty",
      hints: keywordOnly > 0 ? [{ kind: "keywordOnly", count: keywordOnly }] : [],
      ready,
      total,
      processing,
      failed,
      keywordOnly,
      degraded,
    };
  }

  let score = Math.round((ready / total) * 100);
  let label: HealthLabel = score >= 85 ? "ok" : score >= 60 ? "degraded" : "heavyFailure";

  if (failed > 0) {
    score -= Math.min(40, failed * 4);
    label = failed >= 5 ? "heavyFailure" : "partialFailure";
  } else if (processing > 0) {
    score -= Math.min(20, processing * 2);
    label = "indexing";
  } else if (degraded > 0) {
    score -= Math.min(8, degraded * 2);
    label = "degraded";
  } else if (score >= 85) {
    label = "ok";
  }

  score = Math.max(0, Math.min(100, score));
  const tone: HealthTone = score >= 85 ? "ok" : score >= 60 ? "warn" : "err";

  const hints: HealthHint[] = [];
  if (failed > 0) hints.push({ kind: "failed", count: failed });
  if (processing > 0) hints.push({ kind: "processing", count: processing });
  if (degraded > 0) hints.push({ kind: "degraded", count: degraded });
  if (hints.length === 0 && keywordOnly > 0) {
    hints.push({ kind: "keywordOnly", count: keywordOnly });
  }

  return {
    score,
    tone,
    label,
    hints: hints.slice(0, 3),
    ready,
    total,
    processing,
    failed,
    keywordOnly,
    degraded,
  };
}

/**
 * The model label the hub shows on a library row. Provider prefixes such as
 * `BAAI/` are noise in a one-line meta column, so they are dropped; a missing
 * model means the library is embedded locally by the host.
 */
export function embeddingLabel(library: KnowledgeLibrary): string {
  const model = library.embeddingModel?.trim();
  if (model) return model.replace(/^BAAI\//, "");
  if (!library.semanticEnabled) return "local";
  return "local";
}

/** Short local date (`2026-11-23`) for list meta and activity rows. */
export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMonthDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export type RelativeTime =
  | { kind: "justNow" }
  | { kind: "minutes"; count: number }
  | { kind: "hours"; count: number }
  | { kind: "days"; count: number }
  | { kind: "date"; value: string };

/** Mirrors EvoFlow's relative-time thresholds for the activity card. */
export function relativeTime(value: string): RelativeTime {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { kind: "date", value: "" };
  const diff = Date.now() - date.getTime();
  if (diff < 45_000) return { kind: "justNow" };
  if (diff < 3_600_000) return { kind: "minutes", count: Math.floor(diff / 60_000) };
  if (diff < 86_400_000) return { kind: "hours", count: Math.floor(diff / 3_600_000) };
  if (diff < 7 * 86_400_000) return { kind: "days", count: Math.floor(diff / 86_400_000) };
  return { kind: "date", value: formatShortDate(value) };
}
