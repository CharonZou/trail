import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  KnowledgeDocument,
  KnowledgeLibrary,
  KnowledgeSearchMode,
  KnowledgeSearchResult,
} from "@trail/shared";
import { api } from "../../lib/api";
import { Button, Input, Select, TooltipButton, cx } from "../../components/ui";
import {
  IconBookOpen,
  IconChevronLeft,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconTriangleAlert,
  IconX,
} from "../../components/icons";
import { useAppStore } from "../../stores/app-store";
import { KnowledgeDocumentReader } from "./KnowledgeDocumentReader";

const MODES: KnowledgeSearchMode[] = ["hybrid", "keyword", "semantic"];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DetailProps = {
  library: KnowledgeLibrary;
  documents: KnowledgeDocument[];
  loading: boolean;
  busy: boolean;
  /** Focus the retrieval box when arrived from a quick action. */
  autoFocusSearch?: boolean;
  /** Start on the "needs attention" document filter. */
  initialIssuesOnly?: boolean;
  onBack: () => void;
  onImport: () => void;
  onAddNote: () => void;
  onIndex: () => void;
  onDeleteLibrary: () => void;
  onDeleteDocument: (document: KnowledgeDocument) => void;
  onSearchFinished: () => void;
};

/**
 * One library's workbench: retrieval, ingestion and the document list. The
 * hub owns discovery; this view owns the library itself.
 */
export function KnowledgeLibraryDetail({
  library,
  documents,
  loading,
  busy,
  autoFocusSearch,
  initialIssuesOnly,
  onBack,
  onImport,
  onAddNote,
  onIndex,
  onDeleteLibrary,
  onDeleteDocument,
  onSearchFinished,
}: DetailProps) {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<KnowledgeSearchMode>(
    library.semanticEnabled ? "hybrid" : "keyword",
  );
  const [search, setSearch] = useState<KnowledgeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(Boolean(initialIssuesOnly));
  const [openDocument, setOpenDocument] = useState<KnowledgeDocument | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocusSearch) inputRef.current?.focus();
  }, [autoFocusSearch]);

  const runSearch = useCallback(
    async (raw: string): Promise<void> => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setSearch(null);
        return;
      }
      setSearching(true);
      try {
        const result = await api.knowledgeSearch({
          query: trimmed,
          libraryId: library.id,
          mode,
          limit: 10,
        });
        setSearch(result);
        if (result.semanticError) showToast(result.semanticError, { variant: "info" });
        onSearchFinished();
      } catch (error) {
        showToast(errorText(error), { variant: "error" });
      } finally {
        setSearching(false);
      }
    },
    [library.id, mode, onSearchFinished, showToast],
  );

  const failedCount = documents.filter((document) => document.status === "failed").length;
  const pendingChunks = library.chunkCount - library.embeddedChunkCount;
  const visibleDocuments = useMemo(
    () => (issuesOnly ? documents.filter((document) => document.status === "failed") : documents),
    [documents, issuesOnly],
  );

  if (openDocument) {
    return (
      <KnowledgeDocumentReader
        library={library}
        document={openDocument}
        onBack={() => setOpenDocument(null)}
      />
    );
  }

  return (
    <div className="knowledge-detail knowledge-detail-page">
      <button type="button" className="knowledge-back" onClick={onBack}>
        <IconChevronLeft size={14} />
        {t("knowledge.backToHub")}
      </button>

      <header className="knowledge-detail-head">
        <div className="knowledge-detail-title">
          <span className="knowledge-row__icon" aria-hidden>
            <IconBookOpen size={18} />
          </span>
          <div>
            <h2>
              {library.name}
              {library.semanticEnabled ? (
                <span className="knowledge-badge">
                  <IconSparkles size={11} aria-hidden />
                  {t("knowledge.semanticBadge")}
                </span>
              ) : null}
            </h2>
            <p>
              {library.description ||
                t("knowledge.detailMeta", {
                  documents: library.documentTotal,
                  chunks: library.chunkCount,
                })}
            </p>
          </div>
        </div>
        <div className="knowledge-detail-actions">
          <Button size="sm" disabled={busy} onClick={onImport}>
            {t("knowledge.addFiles")}
          </Button>
          <Button size="sm" disabled={busy} onClick={onAddNote}>
            <IconPlus size={13} />
            {t("knowledge.addNote")}
          </Button>
          {library.semanticEnabled ? (
            <Button size="sm" disabled={busy} onClick={onIndex}>
              <IconSparkles size={13} />
              {t("knowledge.rebuildIndex")}
            </Button>
          ) : null}
          <TooltipButton
            tooltip={t("knowledge.deleteLibrary")}
            ariaLabel={t("knowledge.deleteLibrary")}
            disabled={busy}
            onClick={onDeleteLibrary}
          >
            <IconTrash size={14} />
          </TooltipButton>
        </div>
      </header>

      {library.semanticEnabled && pendingChunks > 0 ? (
        <p className="knowledge-hint">
          <IconSparkles size={12} aria-hidden />
          {t("knowledge.semanticPending", {
            embedded: library.embeddedChunkCount,
            chunks: library.chunkCount,
          })}
        </p>
      ) : null}
      {failedCount > 0 ? (
        <p className="knowledge-hint is-warning">
          <IconTriangleAlert size={12} aria-hidden />
          {t("knowledge.failedDocumentsHint", { count: failedCount })}
        </p>
      ) : null}

      <div className="knowledge-search-row">
        <label className="knowledge-search-field">
          <IconSearch size={14} aria-hidden />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={t("knowledge.searchPlaceholder")}
            aria-label={t("knowledge.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch(query);
            }}
          />
          {query ? (
            <TooltipButton
              tooltip={t("knowledge.clearSearch")}
              ariaLabel={t("knowledge.clearSearch")}
              onClick={() => {
                setQuery("");
                setSearch(null);
              }}
            >
              <IconX size={12} />
            </TooltipButton>
          ) : null}
        </label>
        <Select
          value={mode}
          aria-label={t("knowledge.searchMode")}
          onChange={(event) => setMode(event.target.value as KnowledgeSearchMode)}
        >
          {MODES.map((item) => (
            <option
              key={item}
              value={item}
              disabled={item !== "keyword" && !library.semanticEnabled}
            >
              {t(`knowledge.mode.${item}`)}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={searching || !query.trim()} onClick={() => void runSearch(query)}>
          {searching ? t("knowledge.searching") : t("knowledge.search")}
        </Button>
      </div>

      {search ? (
        <div className="knowledge-results" aria-live="polite">
          {search.degraded ? <p className="knowledge-hint">{t("knowledge.degraded")}</p> : null}
          {search.hits.length === 0 ? (
            <div className="knowledge-empty">{t("knowledge.noResults")}</div>
          ) : (
            search.hits.map((hit) => (
              <article key={`${hit.documentId}-${hit.chunkOrdinal}`} className="knowledge-result">
                <header>
                  <span className="knowledge-result-title">{hit.documentTitle}</span>
                  <span className="knowledge-result-score">
                    {t("knowledge.chunkLabel", { index: hit.chunkOrdinal + 1 })}
                  </span>
                </header>
                <p>{hit.snippet}</p>
              </article>
            ))
          )}
        </div>
      ) : null}

      <div className="knowledge-documents-head">
        <h3>{t("knowledge.documents", { count: documents.length })}</h3>
        {failedCount > 0 ? (
          <div className="knowledge-segmented" role="group" aria-label={t("knowledge.documents")}>
            <button
              type="button"
              className={cx(!issuesOnly && "active")}
              aria-pressed={!issuesOnly}
              onClick={() => setIssuesOnly(false)}
            >
              {t("knowledge.allDocuments")}
            </button>
            <button
              type="button"
              className={cx(issuesOnly && "active")}
              aria-pressed={issuesOnly}
              onClick={() => setIssuesOnly(true)}
            >
              {t("knowledge.issuesDocuments", { count: failedCount })}
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="knowledge-empty">{t("knowledge.loading")}</div>
      ) : visibleDocuments.length === 0 ? (
        <div className="knowledge-empty">
          {issuesOnly ? t("knowledge.noIssuesDocuments") : t("knowledge.emptyDocuments")}
        </div>
      ) : (
        <ul className="knowledge-documents">
          {visibleDocuments.map((document) => (
            <li key={document.id} className="knowledge-document">
              <button
                type="button"
                className="knowledge-document-open"
                onClick={() => setOpenDocument(document)}
                title={t("knowledge.openDocument")}
              >
                <span className="knowledge-document-main">
                  <span className="knowledge-document-title">{document.title}</span>
                  <span className="knowledge-document-meta">
                    {document.status === "failed"
                      ? document.errorMessage ?? document.errorCode ?? t("knowledge.status.failed")
                      : t("knowledge.documentMeta", {
                          chunks: document.chunkCount,
                          size: formatBytes(document.byteSize),
                        })}
                  </span>
                </span>
                <span
                  className={cx(
                    "knowledge-document-status",
                    document.status === "failed" && "is-failed",
                  )}
                >
                  {t(`knowledge.status.${document.status}`)}
                </span>
              </button>
              <TooltipButton
                tooltip={t("knowledge.deleteDocument")}
                ariaLabel={t("knowledge.deleteDocument")}
                onClick={() => onDeleteDocument(document)}
              >
                <IconX size={12} />
              </TooltipButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
