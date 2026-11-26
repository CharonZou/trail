import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  KnowledgeDocument,
  KnowledgeDocumentContentKind,
} from "@trail/shared";
import { Markdown } from "../../../components/Markdown";
import { Button, cx } from "../../../components/ui";
import { IconClock, IconFileText, IconPencil, IconTriangleAlert } from "../../../components/icons";
import { formatShortDate } from "../health";
import { fileName, type DocStats } from "./doc-stats";
import type { OutlineItem } from "./types";

const KIND_KEY: Record<KnowledgeDocumentContentKind, string> = {
  markdown: "markdown",
  text: "text",
  "pdf-text": "pdf",
  "office-text": "office",
};

type ReaderProps = {
  document: KnowledgeDocument;
  content: string;
  stats: DocStats;
  description: string;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  jumpRef: React.MutableRefObject<((id: string) => void) | null>;
  onOutline: (items: OutlineItem[]) => void;
  onActiveHeading: (id: string | null) => void;
  onSave: (content: string) => Promise<boolean>;
};

/**
 * Center pane: the page band (source, kind, edit affordances), the hero card and
 * the rendered Markdown. The body comes from `knowledge.getDocumentContent`, so
 * edits round-trip through host-core instead of living in renderer state.
 */
export function WorkbenchReader({
  document,
  content,
  stats,
  description,
  loading,
  error,
  truncated,
  containerRef,
  jumpRef,
  onOutline,
  onActiveHeading,
  onSave,
}: ReaderProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const proseRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(content);
  }, [content, editing]);

  useEffect(() => {
    setEditing(false);
  }, [document.id]);

  // The outline is read from the rendered DOM, which is the same tree the user
  // scrolls: ids and order cannot drift from the visible headings.
  useEffect(() => {
    const prose = proseRef.current;
    if (!prose) {
      if (!editing) onOutline([]);
      return;
    }
    const headings = [...prose.querySelectorAll<HTMLElement>("h1, h2, h3, h4")];
    const items: OutlineItem[] = headings.map((element, index) => {
      const id = `kw-${document.id}-h${index}`;
      element.id = id;
      return {
        id,
        text: element.textContent?.trim() ?? "",
        level: Number(element.tagName[1]) || 2,
      };
    });
    onOutline(items);

    const container = containerRef.current;
    if (!container || items.length === 0) {
      onActiveHeading(null);
      return;
    }
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          seen.set((entry.target as HTMLElement).id, entry.isIntersecting);
        }
        const first = items.find((item) => seen.get(item.id));
        onActiveHeading(first?.id ?? null);
      },
      { root: container, rootMargin: "0px 0px -68% 0px" },
    );
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [containerRef, document.id, editing, content, onActiveHeading, onOutline]);

  useEffect(() => {
    jumpRef.current = (id: string) => {
      const node = proseRef.current
        ? [...proseRef.current.querySelectorAll<HTMLElement>("[id]")].find(
            (element) => element.id === id,
          )
        : null;
      node?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    return () => {
      jumpRef.current = null;
    };
  }, [jumpRef]);

  const editable = document.contentKind === "markdown" || document.contentKind === "text";
  const source = fileName(document.sourcePath);
  const dirty = draft !== content;

  const commit = async (): Promise<void> => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const saved = await onSave(draft);
      if (saved) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="kw-main" ref={containerRef}>
      <div className="kw-pagebar">
        <span className="kw-pagebar__file" title={document.sourcePath ?? document.title}>
          <IconFileText size={12} aria-hidden />
          {source ?? t("knowledge.workbench.info.note")}
        </span>
        <span className="kw-chip">{t(`knowledge.workbench.kind.${KIND_KEY[document.contentKind]}`)}</span>
        <span className="kw-chip is-muted">
          {t("knowledge.readerCharsValue", { count: stats.chars })}
        </span>
        {document.status === "failed" ? (
          <span className="kw-chip is-error">{t("knowledge.status.failed")}</span>
        ) : null}
        <div className="kw-pagebar__spacer" />
        {editing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setDraft(content);
                setEditing(false);
              }}
            >
              {t("knowledge.workbench.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={saving || !dirty}
              onClick={() => void commit()}
            >
              {saving ? t("knowledge.workbench.saving") : t("knowledge.workbench.save")}
            </Button>
          </>
        ) : editable ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(content);
              setEditing(true);
            }}
          >
            <IconPencil size={12} aria-hidden />
            {t("knowledge.workbench.edit")}
          </Button>
        ) : (
          <span className="kw-chip is-muted">{t("knowledge.workbench.readOnly")}</span>
        )}
      </div>

      <div className="kw-hero">
        <p className="kw-hero__eyebrow">
          <span>{source ?? t(`knowledge.workbench.kind.${KIND_KEY[document.contentKind]}`)}</span>
          <span className="kw-hero__dot" aria-hidden />
          <span>
            <IconClock size={11} aria-hidden /> {t("knowledge.workbench.readingTime", { count: stats.readingMinutes })}
          </span>
        </p>
        <h1 className="kw-hero__title">{document.title}</h1>
        {description ? <p className="kw-hero__desc">{description}</p> : null}
        <ul className="kw-hero__stats">
          <li>
            <span>{stats.chars.toLocaleString()}</span>
            {t("knowledge.workbench.hero.chars")}
          </li>
          <li>
            <span>{document.chunkCount}</span>
            {t("knowledge.workbench.hero.chunks")}
          </li>
          <li>
            <span>{stats.headings}</span>
            {t("knowledge.workbench.hero.headings")}
          </li>
          <li>
            <span>{formatShortDate(document.updatedAt)}</span>
            {t("knowledge.workbench.hero.updated")}
          </li>
        </ul>
      </div>

      {truncated ? <p className="kw-note">{t("knowledge.readerTruncated")}</p> : null}
      {editing ? (
        <p className="kw-note">{t("knowledge.workbench.editingHint")}</p>
      ) : null}

      {error ? (
        <div className="kw-state is-error">
          <IconTriangleAlert size={16} aria-hidden />
          <p>{error}</p>
        </div>
      ) : document.status === "failed" ? (
        <div className="kw-state is-error">
          <IconTriangleAlert size={16} aria-hidden />
          <div>
            <h3>{t("knowledge.readerFailedTitle")}</h3>
            <p>{document.errorMessage ?? document.errorCode ?? t("knowledge.status.failed")}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="kw-state">{t("knowledge.readerLoading")}</div>
      ) : editing ? (
        <textarea
          className="kw-editor"
          value={draft}
          spellCheck={false}
          aria-label={document.title}
          placeholder={t("knowledge.workbench.editorPlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : content.trim() ? (
        <article className={cx("kw-prose", "knowledge-reader-markdown")} ref={proseRef}>
          <Markdown source={content} renderDiagrams={false} />
        </article>
      ) : (
        <div className="kw-state">{t("knowledge.readerEmpty")}</div>
      )}
    </section>
  );
}
