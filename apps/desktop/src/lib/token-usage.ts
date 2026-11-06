import type { TokenUsageHistoryItem, TokenUsageModelTotal } from "@trail/shared";

/**
 * Pure shaping for the sidebar usage meter. The host folds one SQL pass into
 * both a per-day history and a per-model ranking, so these helpers only
 * re-space the numbers for two fixed-size views and must never invent a
 * second total.
 */

export type UsageHeatCell = {
  /** Host bucket key, `YYYY-MM-DD`. Null pads a partial edge week. */
  date: string | null;
  totalTokens: number;
};

/** Column-major grid: one column per week, rows ordered Monday first. */
export function buildUsageHeatGrid(
  items: readonly Pick<TokenUsageHistoryItem, "date" | "totalTokens">[],
): UsageHeatCell[][] {
  const totals = new Map(items.map((item) => [item.date, item.totalTokens]));
  const dates = [...totals.keys()].sort();
  if (dates.length === 0) return [];

  const first = new Date(`${dates[0]}T00:00:00`);
  if (Number.isNaN(first.getTime())) return [];

  // Step day by day rather than row by row: a day the host left out of the
  // range must still land in its own weekday row, or the strip would slide the
  // whole year sideways and read as a different distribution.
  const key = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const lastKey = dates[dates.length - 1];
  const cells: UsageHeatCell[] = Array.from({ length: (first.getDay() + 6) % 7 }, () => ({
    date: null,
    totalTokens: 0,
  }));
  const cursor = new Date(first);
  for (;;) {
    const date = key(cursor);
    cells.push({ date, totalTokens: totals.get(date) ?? 0 });
    if (date >= lastKey) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, totalTokens: 0 });

  const columns: UsageHeatCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    columns.push(cells.slice(index, index + 7));
  }
  return columns;
}

/**
 * Quartiles of the active days only, nearest-rank. Zero days are their own
 * level, so a year with a handful of sessions still lights those days up.
 */
export function usageHeatThresholds(
  items: readonly Pick<TokenUsageHistoryItem, "totalTokens">[],
): [number, number, number] {
  const active = items
    .map((item) => item.totalTokens)
    .filter((total) => total > 0)
    .sort((left, right) => left - right);
  if (active.length === 0) return [0, 0, 0];
  const rank = (quantile: number) =>
    active[Math.max(0, Math.min(active.length - 1, Math.ceil(quantile * active.length) - 1))];
  return [rank(0.25), rank(0.5), rank(0.75)];
}

/** CSS intensity step: 0 for idle, 1..4 across the quartiles. */
export function usageHeatLevel(totalTokens: number, thresholds: [number, number, number]): number {
  if (totalTokens <= 0) return 0;
  return 1 + thresholds.filter((threshold) => totalTokens > threshold).length;
}

export type UsageModelRow = {
  key: string;
  providerId: string | null;
  modelId: string | null;
  totalTokens: number;
  turnCount: number;
  /** Fraction of the range total, 0..1. */
  share: number;
};

export type UsageModelBreakdown = {
  rows: UsageModelRow[];
  /** Everything past `limit`, folded into one row so the bars still add up. */
  others: UsageModelRow | null;
  othersCount: number;
  /**
   * Widest bar in the view — ranked rows *and* the folded tail — so the ranking
   * reads as relative volume at a glance. A long tail can outgrow the leading
   * model, and a scale that ignored it would draw that tail wider than its
   * track, where `overflow: hidden` clips the excess and overstates it.
   */
  scale: number;
};

function row(
  model: Pick<TokenUsageModelTotal, "providerId" | "modelId" | "totalTokens" | "turnCount">,
  totalTokens: number,
): UsageModelRow {
  return {
    key: `${model.providerId ?? "unknown"}/${model.modelId ?? "unknown"}`,
    providerId: model.providerId,
    modelId: model.modelId,
    totalTokens: model.totalTokens,
    turnCount: model.turnCount,
    share: totalTokens > 0 ? model.totalTokens / totalTokens : 0,
  };
}

/**
 * Rank the models by volume and keep the list short enough to render without
 * scrolling. The host already orders rows by `totalTokens` descending; the
 * re-sort here only makes that order a local invariant.
 */
export function usageModelBreakdown(
  models: readonly TokenUsageModelTotal[],
  totalTokens: number,
  limit = 5,
): UsageModelBreakdown {
  const ordered = [...models].sort((left, right) => right.totalTokens - left.totalTokens);
  const rows = ordered.slice(0, limit).map((model) => row(model, totalTokens));
  const tail = ordered.slice(limit);
  const others = tail.length
    ? row(
        {
          providerId: null,
          modelId: null,
          totalTokens: tail.reduce((sum, model) => sum + model.totalTokens, 0),
          turnCount: tail.reduce((sum, model) => sum + model.turnCount, 0),
        },
        totalTokens,
      )
    : null;
  const widest = [...rows, ...(others ? [others] : [])].reduce(
    (scale, current) => Math.max(scale, current.totalTokens),
    0,
  );
  return { rows, others, othersCount: tail.length, scale: widest };
}
