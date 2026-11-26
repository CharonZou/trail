import { useTranslation } from "react-i18next";
import type {
  KnowledgeActivity,
  KnowledgeDocument,
  KnowledgeLibrary,
} from "@trail/shared";
import { cx } from "../../../components/ui";
import { IconActivity, IconCheck, IconInfo, IconLink, IconSparkles } from "../../../components/icons";
import { formatShortDate, relativeTime } from "../health";
import { fileName, type DocStats } from "./doc-stats";
import type { DocHealth, DocHealthHint } from "./doc-health";

type RailProps = {
  library: KnowledgeLibrary;
  document: KnowledgeDocument;
  stats: DocStats;
  health: DocHealth;
  related: KnowledgeDocument[];
  activities: KnowledgeActivity[];
  onOpenDocument: (document: KnowledgeDocument) => void;
};

function Gauge({ score, tone }: { score: number; tone: DocHealth["tone"] }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const filled = (circumference * score) / 100;
  return (
    <svg
      className={cx("kw-gauge", `is-${tone}`)}
      viewBox="0 0 80 80"
      role="img"
      aria-label={`${score}`}
    >
      <circle cx="40" cy="40" r={radius} className="kw-gauge__track" />
      <circle
        cx="40"
        cy="40"
        r={radius}
        className="kw-gauge__arc"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="45" textAnchor="middle" className="kw-gauge__value">
        {score}
      </text>
    </svg>
  );
}

/**
 * Right pane: the document's own health, facts, index state, sibling documents
 * and the activity trail. Every card answers a question the reader page raises —
 * "is this trustworthy, what is it, is it indexed, what else is here, what
 * happened" — and every value is read from host-core state.
 */
export function WorkbenchRail({
  library,
  document,
  stats,
  health,
  related,
  activities,
  onOpenDocument,
}: RailProps) {
  const { t } = useTranslation();
  const source = fileName(document.sourcePath);
  const pending = library.chunkCount - library.embeddedChunkCount;
  const docActivities = activities.filter((row) => row.documentId === document.id).slice(0, 6);

  const hintText = (hint: DocHealthHint): string => {
    switch (hint) {
      case "failed":
        return t("knowledge.workbench.health.hintFailed");
      case "noChunks":
        return t("knowledge.workbench.health.hintNoChunks");
      case "pendingVectors":
        return t("knowledge.workbench.health.hintPendingVectors");
      case "noHeadings":
        return t("knowledge.workbench.health.hintNoHeadings");
      case "stale":
        return t("knowledge.workbench.health.hintStale");
    }
  };

  return (
    <aside className="kw-rail">
      <section className="kw-card">
        <h3>{t("knowledge.workbench.rail.health")}</h3>
        <div className="kw-health">
          <Gauge score={health.score} tone={health.tone} />
          <div className="kw-health__copy">
            <span className={cx("kw-health__label", `is-${health.tone}`)}>
              {t(`knowledge.workbench.health.label.${health.tone}`)}
            </span>
            {health.hints.length === 0 ? (
              <span className="kw-health__hint">
                <IconCheck size={11} aria-hidden />
                {t("knowledge.workbench.health.allGood")}
              </span>
            ) : (
              <ul className="kw-health__hints">
                {health.hints.map((hint) => (
                  <li key={hint}>{hintText(hint)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="kw-card">
        <h3>{t("knowledge.workbench.rail.info")}</h3>
        <dl className="kw-facts">
          <div>
            <dt>{t("knowledge.readerFile")}</dt>
            <dd title={document.sourcePath ?? ""}>
              {source ?? t("knowledge.workbench.info.note")}
            </dd>
          </div>
          <div>
            <dt>{t("knowledge.readerType")}</dt>
            <dd>{document.mediaType}</dd>
          </div>
          <div>
            <dt>{t("knowledge.workbench.info.path")}</dt>
            <dd title={document.sourcePath ?? ""}>
              {document.sourcePath ?? t("knowledge.workbench.info.note")}
            </dd>
          </div>
          <div>
            <dt>{t("knowledge.readerChars")}</dt>
            <dd>{stats.chars.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t("knowledge.workbench.hero.headings")}</dt>
            <dd>{stats.headings}</dd>
          </div>
          <div>
            <dt>{t("knowledge.readerChunks")}</dt>
            <dd>{document.chunkCount}</dd>
          </div>
          <div>
            <dt>{t("knowledge.workbench.info.created")}</dt>
            <dd>{formatShortDate(document.createdAt)}</dd>
          </div>
          <div>
            <dt>{t("knowledge.readerUpdated")}</dt>
            <dd>{formatShortDate(document.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="kw-card">
        <h3>
          <IconSparkles size={12} aria-hidden />
          {t("knowledge.workbench.rail.index")}
        </h3>
        <p className="kw-card__body">
          {library.semanticEnabled
            ? t("knowledge.readerIndexVectors", {
                embedded: library.embeddedChunkCount,
                chunks: library.chunkCount,
              })
            : t("knowledge.readerIndexKeyword")}
        </p>
        <p className="kw-card__meta">
          {library.semanticEnabled && pending > 0
            ? t("knowledge.workbench.index.pending", { count: pending })
            : t("knowledge.workbench.index.keywordReady")}
        </p>
      </section>

      <section className="kw-card">
        <h3>
          <IconLink size={12} aria-hidden />
          {t("knowledge.workbench.rail.related")}
        </h3>
        <p className="kw-card__meta">{t("knowledge.workbench.related.caption")}</p>
        {related.length === 0 ? (
          <p className="kw-card__body">{t("knowledge.workbench.related.empty")}</p>
        ) : (
          <ul className="kw-related">
            {related.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => onOpenDocument(row)}>
                  <span className="kw-related__title">{row.title}</span>
                  <span className="kw-related__meta">
                    {t("knowledge.documentMeta", {
                      chunks: row.chunkCount,
                      size: formatSize(row.byteSize),
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="kw-card">
        <h3>
          <IconActivity size={12} aria-hidden />
          {t("knowledge.workbench.rail.activity")}
        </h3>
        {docActivities.length === 0 ? (
          <p className="kw-card__body">{t("knowledge.workbench.activity.empty")}</p>
        ) : (
          <ul className="kw-activity">
            {docActivities.map((row) => {
              const when = relativeTime(row.createdAt);
              const stamp =
                when.kind === "justNow"
                  ? t("knowledge.activity.justNow")
                  : when.kind === "minutes"
                    ? t("knowledge.activity.minutesAgo", { count: when.count })
                    : when.kind === "hours"
                      ? t("knowledge.activity.hoursAgo", { count: when.count })
                      : when.kind === "days"
                        ? t("knowledge.activity.daysAgo", { count: when.count })
                        : when.value;
              return (
                <li key={row.id}>
                  <span className="kw-activity__action">
                    {t(`knowledge.activity.action.${row.action}`, { defaultValue: row.action })}
                  </span>
                  <span className="kw-activity__time">{stamp}</span>
                </li>
              );
            })}
          </ul>
        )}
        {docActivities.length === 0 ? (
          <p className="kw-card__meta">
            <IconInfo size={11} aria-hidden /> {t("knowledge.workbench.activity.hint")}
          </p>
        ) : null}
      </section>
    </aside>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
