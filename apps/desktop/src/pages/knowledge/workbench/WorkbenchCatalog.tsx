import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KnowledgeDocument } from "@trail/shared";
import { cx, TooltipButton } from "../../../components/ui";
import {
  IconChevronRight,
  IconFileText,
  IconFolderTree,
  IconSearch,
  IconTrash,
  IconX,
} from "../../../components/icons";
import { catalogFolders, fileName } from "./doc-stats";
import type { OutlineItem } from "./types";

type CatalogMode = "files" | "outline";

type CatalogProps = {
  documents: KnowledgeDocument[];
  activeId: string | null;
  outline: OutlineItem[];
  activeHeadingId: string | null;
  onSelectDocument: (document: KnowledgeDocument) => void;
  onSelectHeading: (id: string) => void;
  onDeleteDocument: (document: KnowledgeDocument) => void;
};

/**
 * Left pane: the library's file tree plus the current document's outline. Folder
 * names come from the imported source paths, so the tree reflects what the user
 * actually added instead of a synthetic grouping.
 */
export function WorkbenchCatalog({
  documents,
  activeId,
  outline,
  activeHeadingId,
  onSelectDocument,
  onSelectHeading,
  onDeleteDocument,
}: CatalogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CatalogMode>("files");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // Folders start collapsed so the tree stays scannable, and a click opens one.
  const toggleFolder = (key: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const folders = useMemo(() => catalogFolders(documents), [documents]);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return folders;
    return folders
      .map((folder) => ({
        ...folder,
        documents: folder.documents.filter(
          (document) =>
            document.title.toLowerCase().includes(needle) ||
            (document.sourcePath ?? "").toLowerCase().includes(needle),
        ),
      }))
      .filter((folder) => folder.documents.length > 0);
  }, [folders, filter]);

  return (
    <aside className="kw-catalog">
      <header className="kw-catalog__head">
        <div className="kw-catalog__title">
          <span>{t("knowledge.workbench.files")}</span>
          <span className="kw-count">{documents.length}</span>
        </div>
        <div className="kw-seg" role="group" aria-label={t("knowledge.workbench.files")}>
          <button
            type="button"
            className={cx(mode === "files" && "active")}
            aria-pressed={mode === "files"}
            onClick={() => setMode("files")}
          >
            {t("knowledge.workbench.files")}
          </button>
          <button
            type="button"
            className={cx(mode === "outline" && "active")}
            aria-pressed={mode === "outline"}
            onClick={() => setMode("outline")}
          >
            {t("knowledge.workbench.outline")}
          </button>
        </div>
      </header>

      {mode === "files" ? (
        <label className="kw-filter">
          <IconSearch size={12} aria-hidden />
          <input
            type="search"
            value={filter}
            placeholder={t("knowledge.workbench.filterPlaceholder")}
            aria-label={t("knowledge.workbench.filterPlaceholder")}
            onChange={(event) => setFilter(event.target.value)}
          />
          {filter ? (
            <button
              type="button"
              className="kw-filter__clear"
              aria-label={t("knowledge.clearSearch")}
              onClick={() => setFilter("")}
            >
              <IconX size={11} />
            </button>
          ) : null}
        </label>
      ) : null}

      <div className="kw-catalog__body">
        {mode === "outline" ? (
          outline.length === 0 ? (
            <p className="kw-empty-hint">{t("knowledge.workbench.noOutline")}</p>
          ) : (
            <ul className="kw-outline">
              {outline.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cx("kw-outline__item", activeHeadingId === item.id && "is-active")}
                    style={{ paddingLeft: `${8 + (Math.min(item.level, 4) - 1) * 12}px` }}
                    onClick={() => onSelectHeading(item.id)}
                  >
                    <span className="kw-outline__text">{item.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : visible.length === 0 ? (
          <p className="kw-empty-hint">{t("knowledge.workbench.catalogEmpty")}</p>
        ) : (
          visible.map((folder) => {
            const key = folder.path || "root";
            // Searching shows every match even though folders default to closed.
            const open = filter.trim().length > 0 || expanded.has(key);
            return (
              <section key={key} className={cx("kw-folder", open ? "is-open" : "is-collapsed")}>
                <button
                  type="button"
                  className="kw-folder__head"
                  title={folder.path}
                  aria-expanded={open}
                  onClick={() => toggleFolder(key)}
                >
                  <IconChevronRight size={11} className="kw-folder__chev" aria-hidden />
                  <IconFolderTree size={13} />
                  <span className="kw-folder__name">
                    {folder.path ? folder.label : t("knowledge.workbench.root")}
                  </span>
                  <span className="kw-count">{folder.documents.length}</span>
                </button>
                {open ? (
                  <ul className="kw-files">
                    {folder.documents.map((document) => (
                      <li key={document.id} className="kw-file">
                        <button
                          type="button"
                          className={cx("kw-file__open", document.id === activeId && "is-active")}
                          aria-current={document.id === activeId ? "true" : undefined}
                          title={document.sourcePath ?? document.title}
                          onClick={() => onSelectDocument(document)}
                        >
                          <span
                            className={cx(
                              "kw-dot",
                              document.status === "failed" ? "is-failed" : "is-ready",
                            )}
                            aria-hidden
                          />
                          <IconFileText size={12} aria-hidden />
                          <span className="kw-file__name">
                            {fileName(document.sourcePath) ?? document.title}
                          </span>
                        </button>
                        <TooltipButton
                          tooltip={t("knowledge.deleteDocument")}
                          ariaLabel={t("knowledge.deleteDocument")}
                          className="kw-file__delete"
                          onClick={() => onDeleteDocument(document)}
                        >
                          <IconTrash size={11} />
                        </TooltipButton>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}
