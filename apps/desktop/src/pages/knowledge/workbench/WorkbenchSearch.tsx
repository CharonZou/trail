import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  KnowledgeLibrary,
  KnowledgeSearchMode,
  KnowledgeSearchResult,
} from "@trail/shared";
import { api } from "../../../lib/api";
import { Button, Input, Select } from "../../../components/ui";
import { IconSearch, IconX } from "../../../components/icons";
import { useAppStore } from "../../../stores/app-store";

const MODES: KnowledgeSearchMode[] = ["hybrid", "keyword", "semantic"];

type SearchProps = {
  library: KnowledgeLibrary;
  autoFocus?: boolean;
  onFinished: () => void;
};

/**
 * The retrieval tab. It keeps the 1.0.5 behaviour (mode selector, degraded
 * hint, chunk-level hits) but lives in the workbench's center pane instead of
 * pushing the document list down the page.
 */
export function WorkbenchSearch({ library, autoFocus, onFinished }: SearchProps) {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<KnowledgeSearchMode>(
    library.semanticEnabled ? "hybrid" : "keyword",
  );
  const [search, setSearch] = useState<KnowledgeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const run = useCallback(
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
          limit: 20,
        });
        setSearch(result);
        if (result.semanticError) showToast(result.semanticError, { variant: "info" });
        onFinished();
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
      } finally {
        setSearching(false);
      }
    },
    [library.id, mode, onFinished, showToast],
  );

  return (
    <section className="kw-search">
      <header className="kw-search__head">
        <h2>{t("knowledge.workbench.rail.search")}</h2>
        <p>{t("knowledge.workbench.searchHint", { name: library.name })}</p>
      </header>

      <div className="kw-search__row">
        <label className="kw-search__field">
          <IconSearch size={14} aria-hidden />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={t("knowledge.searchPlaceholder")}
            aria-label={t("knowledge.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void run(query);
            }}
          />
          {query ? (
            <button
              type="button"
              className="kw-filter__clear"
              aria-label={t("knowledge.clearSearch")}
              onClick={() => {
                setQuery("");
                setSearch(null);
              }}
            >
              <IconX size={12} />
            </button>
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
        <Button size="sm" variant="primary" disabled={searching || !query.trim()} onClick={() => void run(query)}>
          {searching ? t("knowledge.searching") : t("knowledge.search")}
        </Button>
      </div>

      {search ? (
        <div className="kw-results" aria-live="polite">
          {search.degraded ? <p className="kw-note">{t("knowledge.degraded")}</p> : null}
          {search.hits.length === 0 ? (
            <div className="kw-state">{t("knowledge.noResults")}</div>
          ) : (
            search.hits.map((hit) => (
              <article key={`${hit.documentId}-${hit.chunkOrdinal}`} className="kw-result">
                <header>
                  <span className="kw-result__title">{hit.documentTitle}</span>
                  <span className="kw-result__meta">
                    {t("knowledge.chunkLabel", { index: hit.chunkOrdinal + 1 })}
                  </span>
                </header>
                <p>{hit.snippet}</p>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="kw-state">{t("knowledge.workbench.searchEmpty")}</div>
      )}
    </section>
  );
}
