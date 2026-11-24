/**
 * Knowledge base wire types (schema v29).
 *
 * These mirror the `knowledge.*` RPC results exactly; the desktop renders them
 * without re-deriving counts or status.
 */

export type KnowledgeLibrary = {
  id: string;
  name: string;
  description: string;
  embeddingProviderId: string | null;
  embeddingModel: string | null;
  semanticEnabled: boolean;
  /** Ready (searchable) documents. */
  documentCount: number;
  /** Every document row, including failed imports. */
  documentTotal: number;
  failedDocumentCount: number;
  /** Ready documents whose chunks have no vector yet. */
  vectorPendingDocumentCount: number;
  chunkCount: number;
  embeddedChunkCount: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeActivityAction =
  | "base.create"
  | "base.delete"
  | "doc.upload"
  | "doc.manual"
  | "doc.save"
  | "doc.delete"
  | "index.run"
  | "search"
  | "ask";

export type KnowledgeActivity = {
  id: number;
  libraryId: string | null;
  documentId: string | null;
  action: KnowledgeActivityAction | string;
  title: string;
  createdAt: string;
};

export type KnowledgeActivityListResult = {
  activities: KnowledgeActivity[];
};

export type KnowledgeTrendPoint = {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  searches: number;
};

export type KnowledgeActivityTrendResult = {
  days: number;
  points: KnowledgeTrendPoint[];
};

export type KnowledgeDocumentStatus = "ready" | "failed";

export type KnowledgeDocument = {
  id: string;
  libraryId: string;
  title: string;
  sourcePath: string | null;
  mediaType: string;
  byteSize: number;
  status: KnowledgeDocumentStatus;
  errorCode: string | null;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSearchMode = "hybrid" | "keyword" | "semantic";

/** One extracted chunk, returned only by `knowledge.getDocument`. */
export type KnowledgeDocumentChunk = {
  ordinal: number;
  text: string;
  charCount: number;
  /** False until an index pass has written a vector for this chunk. */
  embedded: boolean;
};

export type KnowledgeDocumentPreview = {
  document: KnowledgeDocument;
  chunks: KnowledgeDocumentChunk[];
  /** True when the server capped the returned chunks for a large source. */
  truncated: boolean;
};

export type KnowledgeSearchHit = {
  documentId: string;
  documentTitle: string;
  sourcePath: string | null;
  chunkOrdinal: number;
  snippet: string;
  score: number;
};

export type KnowledgeSearchResult = {
  query: string;
  mode: KnowledgeSearchMode;
  /** Semantic or hybrid fell back to keyword results. */
  degraded: boolean;
  hits: KnowledgeSearchHit[];
};

export type KnowledgeImportStatus = "ready" | "duplicate" | "failed";

export type KnowledgeImportOutcome = {
  path: string;
  documentId: string | null;
  status: KnowledgeImportStatus;
  errorCode: string | null;
  errorMessage: string | null;
  chunkCount: number;
};

export type KnowledgeImportFilesResult = {
  outcomes: KnowledgeImportOutcome[];
};

export type KnowledgeIndexResult = {
  embedded: number;
  remaining: number;
  providerId: string;
  model: string;
};

export type KnowledgeCreateLibraryInput = {
  name: string;
  description?: string;
  embeddingProviderId?: string | null;
  embeddingModel?: string | null;
  semanticEnabled?: boolean;
};

export type KnowledgeUpdateLibraryInput = {
  id: string;
  name?: string;
  description?: string;
  embeddingProviderId?: string | null;
  embeddingModel?: string | null;
  semanticEnabled?: boolean;
};

export type KnowledgeSearchInput = {
  query: string;
  libraryId?: string;
  mode?: KnowledgeSearchMode;
  limit?: number;
};
