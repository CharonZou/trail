import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  KnowledgeActivity,
  KnowledgeDocument,
  KnowledgeDocumentContent,
  KnowledgeLibrary,
} from "@trail/shared";
import { api } from "../../../lib/api";
import { Button, cx, TooltipButton } from "../../../components/ui";
import {
  IconBookOpen,
  IconChat,
  IconChevronLeft,
  IconLink,
  IconMore,
  IconPanelOpen,
  IconPlus,
  IconSearch,
  IconSidebar,
  IconSparkles,
  IconTrash,
} from "../../../components/icons";
import { useAppStore } from "../../../stores/app-store";
import { WorkbenchCatalog } from "./WorkbenchCatalog";
import { WorkbenchReader } from "./WorkbenchReader";
import { WorkbenchRail } from "./WorkbenchRail";
import { WorkbenchSearch } from "./WorkbenchSearch";
import { docStats, heroDescription } from "./doc-stats";
import { docHealth } from "./doc-health";
import type { OutlineItem } from "./types";

type WorkbenchTab = "docs" | "search" | "ask" | "wiki" | "graph";

const TABS: Array<{ id: WorkbenchTab; icon: typeof IconBookOpen; available: boolean }> = [
  { id: "docs", icon: IconBookOpen, available: true },
  { id: "search", icon: IconSearch, available: true },
  { id: "ask", icon: IconChat, available: false },
  { id: "wiki", icon: IconLink, available: false },
  { id: "graph", icon: IconSparkles, available: false },
];

type WorkbenchProps = {
  library: KnowledgeLibrary;
  documents: KnowledgeDocument[];
  activities: KnowledgeActivity[];
  loading: boolean;
  busy: boolean;
  autoFocusSearch?: boolean;
  initialIssuesOnly?: boolean;
  onBack: () => void;
  onImport: () => void;
  onAddNote: () => void;
  onIndex: () => void;
  onDeleteLibrary: () => void;
  onDeleteDocument: (document: KnowledgeDocument) => void;
  onDocumentUpdated: (document: KnowledgeDocument) => void;
  onSaveFinished: () => void;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The library workbench: one full-bleed surface with the library bar on top and
 * three panes underneath (files/outline, reader, rail). Tabs switch the center
 * pane; the assistant, wiki and graph tabs are declared here but arrive in the
 * next phases, so they render an explicit phase note rather than placeholder
 * data.
 */
export function KnowledgeWorkbench({
  library,
  documents,
  activities,
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
  onDocumentUpdated,
  onSaveFinished,
}: WorkbenchProps) {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [tab, setTab] = useState<WorkbenchTab>(autoFocusSearch ? "search" : "docs");
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (documents.length === 0) return null;
    if (initialIssuesOnly) {
      const failed = documents.find((document) => document.status === "failed");
      if (failed) return failed.id;
    }
    return documents[0].id;
  });
  const [content, setContent] = useState<KnowledgeDocumentContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const jumpRef = useRef<((id: string) => void) | null>(null);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeId) ?? null,
    [documents, activeId],
  );

  // Keep a valid selection as documents are imported, renamed or removed.
  useEffect(() => {
    if (activeDocument) return;
    setActiveId(documents.length > 0 ? documents[0].id : null);
  }, [activeDocument, documents]);

  useEffect(() => {
    if (!activeId) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    api
      .knowledgeGetDocumentContent({ libraryId: library.id, documentId: activeId })
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setContent(null);
          setContentError(errorText(reason));
        }
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, library.id]);

  useEffect(() => {
    setOutline([]);
    setActiveHeading(null);
  }, [activeId]);

  const onOutline = useCallback((items: OutlineItem[]) => setOutline(items), []);
  const onActiveHeading = useCallback((id: string | null) => setActiveHeading(id), []);

  const current = content?.document ?? activeDocument;
  const stats = useMemo(() => docStats(content?.content ?? ""), [content]);
  const description = useMemo(
    () => heroDescription(content?.content ?? ""),
    [content],
  );
  const health = useMemo(
    () =>
      current
        ? docHealth({
            document: current,
            library,
            headings: stats.headings,
          })
        : null,
    [current, library, stats.headings],
  );
  const related = useMemo(() => {
    if (!current) return [];
    const folder = current.sourcePath?.replace(/\\/g, "/").replace(/\/[^/]*$/, "") ?? "";
    return documents
      .filter(
        (document) =>
          document.id !== current.id &&
          (document.sourcePath?.replace(/\\/g, "/").replace(/\/[^/]*$/, "") ?? "") === folder,
      )
      .slice(0, 5);
  }, [current, documents]);

  const save = useCallback(
    async (text: string): Promise<boolean> => {
      if (!activeDocument) return false;
      try {
        const result = await api.knowledgeSaveDocumentContent({
          libraryId: library.id,
          documentId: activeDocument.id,
          content: text,
        });
        setContent((previous) =>
          previous
            ? {
                ...previous,
                document: result.document,
                content: text,
                contentState: "ready",
                truncated: false,
              }
            : previous,
        );
        onDocumentUpdated(result.document);
        onSaveFinished();
        showToast(t("knowledge.workbench.saved"), { variant: "success" });
        return true;
      } catch (error) {
        showToast(errorText(error), { variant: "error" });
        return false;
      }
    },
    [activeDocument, library.id, onDocumentUpdated, onSaveFinished, showToast, t],
  );

  const selectDocument = (document: KnowledgeDocument): void => {
    setActiveId(document.id);
    setTab("docs");
  };

  const comingTab = TABS.find((item) => item.id === tab);

  return (
    <div className="knowledge-workbench">
      <header className="kw-bar">
        <TooltipButton
          tooltip={t("knowledge.backToHub")}
          ariaLabel={t("knowledge.backToHub")}
          className="kw-bar__back"
          onClick={onBack}
        >
          <IconChevronLeft size={15} />
        </TooltipButton>

        <div className="kw-bar__title">
          <span className="kw-bar__icon" aria-hidden>
            <IconBookOpen size={15} />
          </span>
          <div className="kw-bar__copy">
            <h1 title={library.name}>{library.name}</h1>
            <p>
              {library.description ||
                t("knowledge.detailMeta", {
                  documents: library.documentTotal,
                  chunks: library.chunkCount,
                })}
            </p>
          </div>
        </div>

        <nav className="kw-tabs" role="tablist" aria-label={t("knowledge.title")}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              title={item.available ? undefined : t("knowledge.workbench.tabComing")}
              className={cx(
                "kw-tab",
                tab === item.id && "is-active",
                !item.available && "is-coming",
              )}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={13} aria-hidden />
              {t(`knowledge.workbench.tabs.${item.id}`)}
            </button>
          ))}
        </nav>

        <div className="kw-bar__actions">
          <Button size="sm" disabled={busy} onClick={onImport}>
            {t("knowledge.addFiles")}
          </Button>
          <TooltipButton
            tooltip={t("knowledge.addNote")}
            ariaLabel={t("knowledge.addNote")}
            disabled={busy}
            onClick={onAddNote}
          >
            <IconPlus size={13} />
          </TooltipButton>
          <TooltipButton
            tooltip={t("knowledge.workbench.details")}
            ariaLabel={t("knowledge.workbench.details")}
            className="kw-drawer-toggle is-rail"
            onClick={() => setRailOpen((open) => !open)}
          >
            <IconPanelOpen size={13} />
          </TooltipButton>
          <div className="kw-more">
            <TooltipButton
              tooltip={t("knowledge.moreActions")}
              ariaLabel={t("knowledge.moreActions")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <IconMore size={14} />
            </TooltipButton>
            {menuOpen ? (
              <div className="knowledge-menu kw-menu" role="menu">
                {library.semanticEnabled ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      setMenuOpen(false);
                      onIndex();
                    }}
                  >
                    <IconSparkles size={12} aria-hidden />
                    {t("knowledge.rebuildIndex")}
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteLibrary();
                  }}
                >
                  <IconTrash size={12} aria-hidden />
                  {t("knowledge.deleteLibrary")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {tab === "search" ? (
        <div className="kw-body is-single">
          <WorkbenchSearch
            library={library}
            autoFocus={autoFocusSearch}
            onFinished={onSaveFinished}
          />
        </div>
      ) : tab === "docs" ? (
        <div
          className={cx(
            "kw-body",
            railOpen && "is-rail-open",
            catalogOpen && "is-catalog-open",
          )}
        >
          <TooltipButton
            tooltip={t("knowledge.workbench.files")}
            ariaLabel={t("knowledge.workbench.files")}
            className="kw-drawer-toggle is-catalog"
            onClick={() => setCatalogOpen((open) => !open)}
          >
            <IconSidebar size={14} />
          </TooltipButton>

          <WorkbenchCatalog
            documents={documents}
            activeId={activeId}
            outline={outline}
            activeHeadingId={activeHeading}
            onSelectDocument={selectDocument}
            onSelectHeading={(id) => jumpRef.current?.(id)}
            onDeleteDocument={onDeleteDocument}
          />

          {current ? (
            <WorkbenchReader
              document={current}
              content={content?.content ?? ""}
              stats={stats}
              description={description}
              loading={contentLoading}
              error={contentError}
              truncated={content?.truncated ?? false}
              containerRef={mainRef}
              jumpRef={jumpRef}
              onOutline={onOutline}
              onActiveHeading={onActiveHeading}
              onSave={save}
            />
          ) : (
            <section className="kw-main">
              <div className="kw-state">
                {loading ? t("knowledge.loading") : t("knowledge.emptyDocuments")}
              </div>
            </section>
          )}

          {current && health ? (
            <WorkbenchRail
              library={library}
              document={current}
              stats={stats}
              health={health}
              related={related}
              activities={activities}
              onOpenDocument={selectDocument}
            />
          ) : null}
        </div>
      ) : (
        <div className="kw-body is-single">
          <div className="kw-phase">
            <span className="kw-phase__icon" aria-hidden>
              {comingTab ? <comingTab.icon size={18} /> : null}
            </span>
            <h2>{t(`knowledge.workbench.tabs.${tab}`)}</h2>
            <p>{t(`knowledge.workbench.phase.${tab}`)}</p>
            <span className="kw-phase__badge">{t("knowledge.workbench.tabComing")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
