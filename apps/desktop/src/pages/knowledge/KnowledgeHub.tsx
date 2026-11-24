import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type {
  KnowledgeActivity,
  KnowledgeActivityAction,
  KnowledgeLibrary,
  KnowledgeTrendPoint,
} from "@trail/shared";
import { Button, TooltipButton, cx } from "../../components/ui";
import {
  IconActivity,
  IconBookOpen,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDatabase,
  IconFileText,
  IconMore,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconX,
} from "../../components/icons";
import {
  aggregateHealth,
  embeddingLabel,
  formatMonthDay,
  formatShortDate,
  libraryStatus,
  relativeTime,
  type HealthHint,
  type LibraryStatus,
} from "./health";

const PAGE_SIZES = [20, 50, 100] as const;
const PAGE_SIZE_KEY = "trail_knowledge_page_size";

export type KnowledgeAssistantAction = "search" | "issues" | "index";

type HubProps = {
  libraries: KnowledgeLibrary[];
  activities: KnowledgeActivity[];
  trend: KnowledgeTrendPoint[];
  loading: boolean;
  busy: boolean;
  onOpen: (libraryId: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onDelete: (library: KnowledgeLibrary) => void;
  onIndex: (library: KnowledgeLibrary) => void;
  onAssistant: (action: KnowledgeAssistantAction) => void;
};

function readPageSize(): number {
  if (typeof window === "undefined") return 20;
  const stored = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return (PAGE_SIZES as readonly number[]).includes(stored) ? stored : 20;
}

function statusTextKey(status: LibraryStatus): string {
  switch (status) {
    case "attention":
      return "attention";
    case "processing":
      return "processing";
    case "empty":
      return "empty";
    case "degraded":
      return "degraded";
    default:
      return "ready";
  }
}

function healthLineKey(library: KnowledgeLibrary): string {
  const status = libraryStatus(library);
  if (status === "attention") return "healthLineFailed";
  if (status === "processing") return "healthLineProcessing";
  if (status === "empty") return "healthLineEmpty";
  if (status === "degraded") return "healthLineDegraded";
  return library.semanticEnabled ? "healthLineReady" : "healthLineKeywordOnly";
}

function hintText(hint: HealthHint, t: TFunction): string {
  switch (hint.kind) {
    case "failed":
      return t("knowledge.health.hintFailed", { count: hint.count });
    case "processing":
      return t("knowledge.health.hintProcessing", { count: hint.count });
    case "degraded":
      return t("knowledge.health.hintDegraded", { count: hint.count });
    case "keywordOnly":
      return t("knowledge.health.hintKeywordOnly", { count: hint.count });
  }
}

function activityActionKey(action: string): string {
  const known: KnowledgeActivityAction[] = [
    "base.create",
    "base.delete",
    "doc.upload",
    "doc.manual",
    "doc.save",
    "doc.delete",
    "index.run",
    "search",
    "ask",
  ];
  return known.includes(action as KnowledgeActivityAction) ? action : "search";
}

/**
 * Knowledge hub: the instrument-panel view of every local library, plus the
 * insight rail (health, visit trend, recent activity, quick actions). The
 * library detail lives in its own component so the hub never grows into the
 * page's God component.
 */
export function KnowledgeHub({
  libraries,
  activities,
  trend,
  loading,
  busy,
  onOpen,
  onCreate,
  onRefresh,
  onDelete,
  onIndex,
  onAssistant,
}: HubProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize);
  const [menuId, setMenuId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const health = useMemo(() => aggregateHealth(libraries), [libraries]);
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return libraries;
    return libraries.filter(
      (library) =>
        library.name.toLowerCase().includes(query) ||
        library.description.toLowerCase().includes(query),
    );
  }, [filter, libraries]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const totalDocuments = libraries.reduce((sum, library) => sum + library.documentTotal, 0);

  useEffect(() => {
    setPage(1);
  }, [filter, pageSize]);

  useEffect(() => {
    if (!menuId) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-knowledge-menu="${menuId}"]`)) return;
      setMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuId]);

  // Scoped page shortcut: Ctrl/⌘+K focuses the library filter without hijacking
  // the global command palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
      if (event.altKey) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const choosePageSize = (value: number) => {
    setPageSize(value);
    try {
      window.localStorage.setItem(PAGE_SIZE_KEY, String(value));
    } catch {
      // Persisting is a nicety; a locked-down profile must not break the pager.
    }
  };

  return (    <div className="knowledge-hub">
      <header className="page-header knowledge-hero">
        <div className="knowledge-hero__title">
          <span className="knowledge-title-icon" aria-hidden>
            <IconBookOpen size={16} />
          </span>
          <div>
            <h1 className="page-title">{t("knowledge.title")}</h1>
            <p className="knowledge-hero__sub">{t("knowledge.subtitle")}</p>
          </div>
        </div>
        <div className="knowledge-header-actions">
          <TooltipButton
            tooltip={t("knowledge.refresh")}
            ariaLabel={t("knowledge.refresh")}
            disabled={loading || busy}
            onClick={onRefresh}
          >
            <IconRefresh size={15} />
          </TooltipButton>
          <Button size="sm" variant="primary" onClick={onCreate}>
            <IconPlus size={14} />
            {t("knowledge.newLibrary")}
          </Button>
        </div>
      </header>

      <div className="knowledge-hub__grid">
        <main className="knowledge-main">
          <div className="knowledge-search-hero" role="search">
            <IconSearch size={16} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={filter}
              className="knowledge-search-hero__input"
              placeholder={t("knowledge.filterPlaceholder")}
              aria-label={t("knowledge.filterPlaceholder")}
              onChange={(event) => setFilter(event.target.value)}
            />
            {filter ? (
              <TooltipButton
                tooltip={t("knowledge.clearSearch")}
                ariaLabel={t("knowledge.clearSearch")}
                onClick={() => setFilter("")}
              >
                <IconX size={12} />
              </TooltipButton>
            ) : (
              <kbd className="knowledge-kbd">{t("knowledge.searchShortcut")}</kbd>
            )}
          </div>

          <div className="knowledge-stats">
            <StatCard
              icon={<IconDatabase size={16} />}
              label={t("knowledge.stats.libraries")}
              value={String(libraries.length)}
              hint={t("knowledge.stats.librariesHint")}
            />
            <StatCard
              icon={<IconFileText size={16} />}
              label={t("knowledge.stats.documents")}
              value={String(totalDocuments)}
              hint={t("knowledge.stats.documentsHint", {
                chunks: libraries.reduce((sum, library) => sum + library.chunkCount, 0),
              })}
            />
            <StatCard
              icon={<IconSparkles size={16} />}
              label={t("knowledge.stats.processing")}
              value={String(health.processing)}
              hint={t("knowledge.stats.processingHint")}
            />
            <StatCard
              icon={<IconActivity size={16} />}
              label={t("knowledge.stats.availability")}
              value={`${health.score}%`}
              hint={t("knowledge.stats.availabilityHint", {
                ready: health.ready,
                total: health.total,
              })}
            />
          </div>

          {loading ? (
            <div className="knowledge-empty knowledge-empty-block">{t("knowledge.loading")}</div>
          ) : libraries.length === 0 ? (
            <div className="knowledge-empty knowledge-empty-block">
              <p className="knowledge-empty-title">{t("knowledge.emptyLibraries")}</p>
              <p>{t("knowledge.emptyLibrariesHint")}</p>
              <Button size="sm" variant="primary" onClick={onCreate}>
                <IconPlus size={14} />
                {t("knowledge.newLibrary")}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="knowledge-empty knowledge-empty-block">{t("knowledge.noMatchingLibraries")}</div>
          ) : (
            <div className="knowledge-data-list">
              {visible.map((library) => {
                const status = libraryStatus(library);
                const healthKey = healthLineKey(library);
                return (
                  <div
                    key={library.id}
                    className="knowledge-row"
                    data-knowledge-menu={library.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenuId(library.id);
                    }}
                  >
                    <button
                      type="button"
                      className="knowledge-row__main"
                      onClick={() => onOpen(library.id)}
                    >
                      <span className="knowledge-row__icon" aria-hidden>
                        <IconBookOpen size={18} />
                      </span>
                      <span className="knowledge-row__copy">
                        <span className="knowledge-row__name">
                          {library.name}
                          {library.semanticEnabled ? (
                            <span className="knowledge-badge">
                              <IconSparkles size={11} aria-hidden />
                              {t("knowledge.semanticBadge")}
                            </span>
                          ) : null}
                        </span>
                        {library.description ? (
                          <span className="knowledge-row__desc">{library.description}</span>
                        ) : null}
                        <span className="knowledge-row__health">
                          <span
                            className={cx("knowledge-status-dot", `is-${status}`)}
                            aria-hidden
                          />
                          {t(`knowledge.${healthKey}`, {
                            count:
                              status === "attention"
                                ? library.failedDocumentCount
                                : library.vectorPendingDocumentCount,
                          })}
                        </span>
                      </span>
                      <span className="knowledge-row__meta">
                        <span>{t("knowledge.stats.documentsCount", { count: library.documentTotal })}</span>
                        <span>{library.semanticEnabled ? embeddingLabel(library) : t("knowledge.mode.keyword")}</span>
                        <span>{formatShortDate(library.updatedAt)}</span>
                      </span>
                    </button>
                    <div className="knowledge-row__menu">
                      <TooltipButton
                        tooltip={t("knowledge.moreActions")}
                        ariaLabel={t("knowledge.moreActions")}
                        aria-haspopup="menu"
                        aria-expanded={menuId === library.id}
                        onClick={() => setMenuId(menuId === library.id ? null : library.id)}
                      >
                        <IconMore size={15} />
                      </TooltipButton>
                      {menuId === library.id ? (
                        <div className="knowledge-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => onOpen(library.id)}>
                            {t("knowledge.openLibrary")}
                          </button>
                          {library.semanticEnabled ? (
                            <button
                              type="button"
                              role="menuitem"
                              disabled={busy}
                              onClick={() => {
                                setMenuId(null);
                                onIndex(library);
                              }}
                            >
                              {t("knowledge.rebuildIndex")}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="menuitem"
                            className="is-danger"
                            onClick={() => {
                              setMenuId(null);
                              onDelete(library);
                            }}
                          >
                            {t("knowledge.deleteLibrary")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length > 0 ? (
            <div className="knowledge-pager">
              <span className="knowledge-pager__count">
                {t("knowledge.pager.range", {
                  total: filtered.length,
                  from: start + 1,
                  to: Math.min(start + pageSize, filtered.length),
                })}
              </span>
              <label className="knowledge-pager__size">
                <span>{t("knowledge.pager.pageSize")}</span>
                <select
                  value={pageSize}
                  aria-label={t("knowledge.pager.pageSize")}
                  onChange={(event) => choosePageSize(Number(event.target.value))}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="knowledge-pager__nav">
                <TooltipButton
                  tooltip={t("knowledge.pager.previous")}
                  ariaLabel={t("knowledge.pager.previous")}
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <IconChevronLeft size={14} />
                </TooltipButton>
                <span className="knowledge-pager__label">
                  {currentPage} / {pageCount}
                </span>
                <TooltipButton
                  tooltip={t("knowledge.pager.next")}
                  ariaLabel={t("knowledge.pager.next")}
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                >
                  <IconChevronRight size={14} />
                </TooltipButton>
              </div>
            </div>
          ) : null}
        </main>

        <aside className="knowledge-insights" aria-label={t("knowledge.insights")}>
          <section className="knowledge-insight-card" aria-labelledby="knowledge-health-title">
            <header className="knowledge-insight-card__head">
              <IconActivity size={15} aria-hidden />
              <h2 id="knowledge-health-title">{t("knowledge.health.title")}</h2>
            </header>
            <div className="knowledge-health">
              <strong className={cx("knowledge-health__score", `is-${health.tone}`)}>
                {health.score}
                <span>%</span>
              </strong>
              <span className={cx("knowledge-health__label", `is-${health.tone}`)}>
                {t(`knowledge.health.label.${health.label}`, { count: health.failed })}
              </span>
            </div>
            {health.hints.length > 0 ? (
              <ul className="knowledge-health__hints">
                {health.hints.map((hint) => (
                  <li key={hint.kind}>{hintText(hint, t)}</li>
                ))}
              </ul>
            ) : (
              <p className="knowledge-insight-card__muted">{t("knowledge.health.allGood")}</p>
            )}
          </section>

          <section className="knowledge-insight-card" aria-labelledby="knowledge-trend-title">
            <header className="knowledge-insight-card__head">
              <IconActivity size={15} aria-hidden />
              <h2 id="knowledge-trend-title">{t("knowledge.trend.title")}</h2>
            </header>
            <TrendChart points={trend} />
            <p className="knowledge-insight-card__muted">
              {t("knowledge.trend.caption", { days: trend.length })}
            </p>
          </section>

          <section className="knowledge-insight-card" aria-labelledby="knowledge-activity-title">
            <header className="knowledge-insight-card__head">
              <IconClock size={15} aria-hidden />
              <h2 id="knowledge-activity-title">{t("knowledge.activity.title")}</h2>
            </header>
            {activities.length === 0 ? (
              <p className="knowledge-insight-card__muted">{t("knowledge.activity.empty")}</p>
            ) : (
              <ul className="knowledge-activity">
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <span className="knowledge-activity__action">
                      {t(`knowledge.activity.action.${activityActionKey(activity.action)}`)}
                    </span>
                    <span className="knowledge-activity__title">{activity.title}</span>
                    <span className="knowledge-activity__time">
                      {formatRelative(activity.createdAt, t)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="knowledge-insight-card" aria-labelledby="knowledge-assistant-title">
            <header className="knowledge-insight-card__head">
              <IconSparkles size={15} aria-hidden />
              <h2 id="knowledge-assistant-title">{t("knowledge.assistant.title")}</h2>
            </header>
            <div className="knowledge-assistant">
              <Button size="sm" disabled={libraries.length === 0} onClick={() => onAssistant("search")}>
                <IconSearch size={13} />
                {t("knowledge.assistant.search")}
              </Button>
              <Button size="sm" disabled={libraries.length === 0} onClick={() => onAssistant("issues")}>
                <IconFileText size={13} />
                {t("knowledge.assistant.issues")}
              </Button>
              <Button
                size="sm"
                disabled={busy || !libraries.some((library) => library.semanticEnabled)}
                onClick={() => onAssistant("index")}
              >
                <IconRefresh size={13} />
                {t("knowledge.assistant.index")}
              </Button>
            </div>
            <p className="knowledge-insight-card__muted">{t("knowledge.assistant.hint")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="knowledge-stat-card">
      <span className="knowledge-stat-card__icon" aria-hidden>
        {icon}
      </span>
      <div className="knowledge-stat-card__copy">
        <span className="knowledge-stat-card__label">{label}</span>
        <strong className="knowledge-stat-card__value">{value}</strong>
        <span className="knowledge-stat-card__hint">{hint}</span>
      </div>
    </div>
  );
}

function TrendChart({ points }: { points: KnowledgeTrendPoint[] }) {
  const { t } = useTranslation();
  const width = 280;
  const height = 108;
  const padX = 8;
  const padTop = 10;
  const padBottom = 22;
  const max = Math.max(1, ...points.map((point) => point.searches));
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const y = (value: number) =>
    height - padBottom - (value / max) * (height - padTop - padBottom);
  const coords = points.map((point, index) => ({
    x: padX + index * step,
    y: y(point.searches),
  }));
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area =
    coords.length > 0
      ? `${coords[0].x},${height - padBottom} ${line} ${coords[coords.length - 1].x},${height - padBottom}`
      : "";
  const total = points.reduce((sum, point) => sum + point.searches, 0);

  return (
    <div className="knowledge-trend">
      {total === 0 ? (
        <p className="knowledge-insight-card__muted">{t("knowledge.trend.empty")}</p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="knowledge-trend__chart"
          role="img"
          aria-label={t("knowledge.trend.caption", { days: points.length })}
        >
          <polygon points={area} className="knowledge-trend__area" />
          <polyline points={line} className="knowledge-trend__line" />
          {coords.slice(-1).map((point) => (
            <circle key="last" cx={point.x} cy={point.y} r={3} className="knowledge-trend__dot" />
          ))}
          <text x={padX} y={height - 6} className="knowledge-trend__tick">
            {formatMonthDay(points[0]?.day ?? "")}
          </text>
          <text x={width - padX} y={height - 6} textAnchor="end" className="knowledge-trend__tick">
            {formatMonthDay(points[points.length - 1]?.day ?? "")}
          </text>
        </svg>
      )}
    </div>
  );
}

function formatRelative(value: string, t: TFunction): string {
  const relative = relativeTime(value);
  switch (relative.kind) {
    case "justNow":
      return t("knowledge.activity.justNow");
    case "minutes":
      return t("knowledge.activity.minutesAgo", { count: relative.count });
    case "hours":
      return t("knowledge.activity.hoursAgo", { count: relative.count });
    case "days":
      return t("knowledge.activity.daysAgo", { count: relative.count });
    default:
      return relative.value;
  }
}
