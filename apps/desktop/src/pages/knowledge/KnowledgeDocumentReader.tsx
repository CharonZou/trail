import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KnowledgeDocument, KnowledgeDocumentPreview, KnowledgeLibrary } from "@trail/shared";
import { api } from "../../lib/api";
import { Markdown } from "../../components/Markdown";
import { Button, cx } from "../../components/ui";
import { IconChevronLeft, IconTriangleAlert } from "../../components/icons";
import { formatShortDate } from "./health";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Read-only document reader. The library list only carries metadata, so the
 * body is fetched on demand through `knowledge.getDocument` and rebuilt from
 * the extracted chunks the search index already stores. No new persistence:
 * the reader shows exactly what was indexed, which keeps preview and retrieval
 * honest with each other.
 */
export function KnowledgeDocumentReader({
  library,
  document,
  onBack,
}: {
  library: KnowledgeLibrary;
  document: KnowledgeDocument;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<KnowledgeDocumentPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .knowledgeGetDocument({ libraryId: library.id, documentId: document.id })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [document.id, library.id]);

  const chunks = preview?.chunks ?? [];
  const body = useMemo(
    () =>
      chunks
        .map((chunk) => chunk.text.trim())
        .filter(Boolean)
        .join("\n\n"),
    [chunks],
  );
  const charCount = useMemo(() => [...body].length, [body]);
  const embeddedChunks = chunks.filter((chunk) => chunk.embedded).length;
  const current = preview?.document ?? document;
  const failed = current.status === "failed";

  return (
    <div className="knowledge-detail knowledge-detail-page knowledge-reader-page">
      <button type="button" className="knowledge-back" onClick={onBack}>
        <IconChevronLeft size={14} />
        {t("knowledge.readerBack", { name: library.name })}
      </button>

      <header className="knowledge-reader-head">
        <div className="knowledge-reader-title">
          <h2>{current.title}</h2>
          <p className="knowledge-reader-meta">
            <span
              className={cx(
                "knowledge-document-status",
                failed && "is-failed",
              )}
            >
              {t(`knowledge.status.${current.status}`)}
            </span>
            <span>{t("knowledge.readerChunkMeta", { chunks: current.chunkCount })}</span>
            <span>{formatBytes(current.byteSize)}</span>
            <span>{formatShortDate(current.updatedAt)}</span>
          </p>
        </div>
        <Button size="sm" onClick={onBack}>
          {t("knowledge.readerToList")}
        </Button>
      </header>

      {loading ? (
        <div className="knowledge-empty">{t("knowledge.readerLoading")}</div>
      ) : error ? (
        <div className="knowledge-empty">{error}</div>
      ) : failed ? (
        <div className="knowledge-reader-error">
          <IconTriangleAlert size={16} aria-hidden />
          <div>
            <h3>{t("knowledge.readerFailedTitle")}</h3>
            <p>{current.errorMessage ?? current.errorCode ?? t("knowledge.status.failed")}</p>
          </div>
        </div>
      ) : (
        <div className="knowledge-reader-grid">
          <article className="knowledge-reader-body">
            {preview?.truncated ? (
              <p className="knowledge-hint">{t("knowledge.readerTruncated")}</p>
            ) : null}
            {body ? (
              <div className="knowledge-reader-markdown">
                <Markdown source={body} renderDiagrams={false} />
              </div>
            ) : (
              <div className="knowledge-empty">{t("knowledge.readerEmpty")}</div>
            )}
          </article>

          <aside className="knowledge-reader-aside">
            <section className="knowledge-insight-card">
              <h3>{t("knowledge.readerInfo")}</h3>
              <dl className="knowledge-reader-facts">
                <div>
                  <dt>{t("knowledge.readerFile")}</dt>
                  <dd title={current.sourcePath ?? ""}>
                    {current.sourcePath?.split(/[\\/]/).pop() ?? current.title}
                  </dd>
                </div>
                <div>
                  <dt>{t("knowledge.readerType")}</dt>
                  <dd>{current.mediaType}</dd>
                </div>
                <div>
                  <dt>{t("knowledge.readerChars")}</dt>
                  <dd>{t("knowledge.readerCharsValue", { count: charCount })}</dd>
                </div>
                <div>
                  <dt>{t("knowledge.readerChunks")}</dt>
                  <dd>{current.chunkCount}</dd>
                </div>
                <div>
                  <dt>{t("knowledge.readerUpdated")}</dt>
                  <dd>{formatShortDate(current.updatedAt)}</dd>
                </div>
              </dl>
            </section>

            <section className="knowledge-insight-card">
              <h3>{t("knowledge.readerIndex")}</h3>
              <p className="knowledge-reader-index">
                {library.semanticEnabled
                  ? t("knowledge.readerIndexVectors", {
                      embedded: embeddedChunks,
                      chunks: chunks.length,
                    })
                  : t("knowledge.readerIndexKeyword")}
              </p>
              <p className="knowledge-reader-source" title={current.sourcePath ?? ""}>
                {current.sourcePath ?? current.title}
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
