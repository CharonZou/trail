import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCompactTokenCount, type TokenUsageHistoryResult } from "@trail/shared";
import { api } from "../lib/api";
import { composerModelDisplayName } from "../lib/composer-models";
import {
  buildUsageHeatGrid,
  usageHeatLevel,
  usageHeatThresholds,
  usageModelBreakdown,
  type UsageModelRow,
} from "../lib/token-usage";
import { useAppStore } from "../stores/app-store";
import { cx } from "./ui";

type UsageView = "calendar" | "model";

/**
 * Token meter under the empty-home hero: one number for the last year, a daily
 * heatmap, and the same total cut by model.
 *
 * Both views come from one host query, so the bars always add up to the strip.
 */
export function TokenUsageCard() {
  const { t, i18n } = useTranslation();
  const providers = useAppStore((state) => state.providers);
  const runningCount = useAppStore((state) => Object.keys(state.runningSessions).length);
  const [history, setHistory] = useState<TokenUsageHistoryResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [view, setView] = useState<UsageView>("calendar");
  const mounted = useRef(true);
  // The host answers each query from whatever it has committed at that moment,
  // so two overlapping fetches can land newest-last. Only the newest request
  // may write.
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    void api
      .getTokenUsageHistory({ bucket: "day" })
      .then((result) => {
        if (!mounted.current || id !== requestId.current) return;
        setUnavailable(false);
        setHistory(result);
      })
      .catch(() => {
        if (mounted.current && id === requestId.current) setUnavailable(true);
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // A finished turn is the only thing that moves these numbers. Waiting until
  // nothing runs keeps one refresh per burst instead of one per start and end,
  // and a parallel session cannot leave the meter showing its predecessor.
  const hadRunningSessions = useRef(false);
  useEffect(() => {
    if (runningCount > 0) {
      hadRunningSessions.current = true;
      return;
    }
    if (!hadRunningSessions.current) return;
    hadRunningSessions.current = false;
    refresh();
  }, [refresh, runningCount]);

  const calendar = useMemo(() => {
    if (!history) return null;
    return {
      columns: buildUsageHeatGrid(history.items),
      thresholds: usageHeatThresholds(history.items),
      activeDays: history.items.filter((item) => item.totalTokens > 0).length,
    };
  }, [history]);

  const breakdown = useMemo(() => {
    if (!history) return null;
    return usageModelBreakdown(history.models ?? [], history.totals.totalTokens);
  }, [history]);

  // Columns run oldest to newest, so when the chat band is squeezed past the
  // legibility floor it is the oldest weeks that get clipped, and the strip
  // opens on the week that contains today. A stable ref callback means exactly
  // one jump — when the strip appears — and a later refresh never drags an
  // older year back out of sight.
  const attachHeat = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollLeft = node.scrollWidth - node.clientWidth;
  }, []);

  // A host built before D682 answers without the model dimension at all, so
  // the ranking is not offered rather than shown as an empty list.
  const hasModelView = Boolean(history && Array.isArray(history.models));

  const formatDate = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || undefined, { dateStyle: "medium" }),
    [i18n.language],
  );

  const modelLabel = (row: UsageModelRow): string => {
    if (!row.modelId) return t("tokenUsage.unknownModel");
    const provider = providers.find((candidate) => candidate.id === row.providerId);
    return provider ? composerModelDisplayName(provider, row.modelId) : row.modelId;
  };

  const totalTokens = history?.totals.totalTokens ?? 0;
  const widest = breakdown?.scale ?? 0;

  return (
    <section className="token-usage-card" aria-label={t("tokenUsage.title")}>
      <div className="token-usage-head">
        <span className="token-usage-title">{t("tokenUsage.title")}</span>
        {hasModelView ? (
          <div
            className="token-usage-switch"
            role="group"
            aria-label={t("tokenUsage.viewLabel")}
          >
            {(["calendar", "model"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={cx("token-usage-switch-option", view === option && "active")}
                aria-pressed={view === option}
                onClick={() => setView(option)}
              >
                {option === "calendar" ? t("tokenUsage.viewCalendar") : t("tokenUsage.viewModels")}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {unavailable ? (
        <p className="token-usage-note">{t("tokenUsage.unavailable")}</p>
      ) : !history || !calendar || !breakdown ? (
        <p className="token-usage-note">{t("tokenUsage.loading")}</p>
      ) : (
        <>
          <p className="token-usage-total">
            <span className="token-usage-total-value">
              {formatCompactTokenCount(totalTokens)}
            </span>
            <span className="token-usage-total-unit">{t("tokenUsage.tokens")}</span>
            <span className="token-usage-total-range">{t("tokenUsage.lastYear")}</span>
          </p>

          {view === "calendar" || !hasModelView ? (
            <div
              ref={attachHeat}
              className="token-usage-heat"
              role="img"
              tabIndex={0}
              aria-label={t("tokenUsage.calendarSummary", {
                days: calendar.activeDays,
                total: formatCompactTokenCount(totalTokens),
              })}
            >
              {calendar.columns.map((week) => (
                <div key={week[0]?.date ?? "padding"} className="token-usage-heat-week">
                  {week.map((cell, dayOfWeek) =>
                    cell.date ? (
                      <span
                        key={cell.date}
                        className={cx("token-usage-heat-cell", `level-${usageHeatLevel(cell.totalTokens, calendar.thresholds)}`)}
                        title={t("tokenUsage.dayTooltip", {
                          date: formatDate.format(new Date(`${cell.date}T00:00:00`)),
                          total: formatCompactTokenCount(cell.totalTokens),
                        })}
                      />
                    ) : (
                      <span
                        key={`padding-${dayOfWeek}`}
                        className="token-usage-heat-cell absent"
                        aria-hidden
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          ) : (
            <ul className="token-usage-models">
              {totalTokens === 0 ? (
                <li className="token-usage-note">{t("tokenUsage.noUsage")}</li>
              ) : (
                <>
                  {breakdown.rows.map((row) => (
                    <li key={row.key} className="token-usage-model">
                      <span className="token-usage-model-name" title={row.modelId ?? undefined}>
                        {modelLabel(row)}
                      </span>
                      <span className="token-usage-model-bar" aria-hidden>
                        <span
                          className="token-usage-model-bar-fill"
                          style={{
                            width: widest > 0 ? `${(row.totalTokens / widest) * 100}%` : "0%",
                          }}
                        />
                      </span>
                      <span className="token-usage-model-total">
                        {formatCompactTokenCount(row.totalTokens)}
                      </span>
                      <span className="token-usage-model-share">
                        {Math.round(row.share * 100)}%
                      </span>
                    </li>
                  ))}
                  {breakdown.others ? (
                    <li className="token-usage-model is-other">
                      <span className="token-usage-model-name">
                        {t("tokenUsage.otherModels", { n: breakdown.othersCount })}
                      </span>
                      <span className="token-usage-model-bar" aria-hidden>
                        <span
                          className="token-usage-model-bar-fill"
                          style={{
                            width:
                              widest > 0
                                ? `${(breakdown.others.totalTokens / widest) * 100}%`
                                : "0%",
                          }}
                        />
                      </span>
                      <span className="token-usage-model-total">
                        {formatCompactTokenCount(breakdown.others.totalTokens)}
                      </span>
                      <span className="token-usage-model-share">
                        {Math.round(breakdown.others.share * 100)}%
                      </span>
                    </li>
                  ) : null}
                </>
              )}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
