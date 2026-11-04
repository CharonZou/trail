/**
 * The completed turn's wall-clock duration, in the units a reader counts in.
 *
 * The process header states the same span in the tool-facing `1m 20s` form; a
 * meta chip read as prose needs the locale's own unit words, and Chinese
 * ("1 分 20 秒") and English ("1 min 20 sec") do not share a separator or a
 * letter, so the string is composed from localized unit parts rather than
 * formatted around one.
 */

type Translate = (key: string, options: { value: number }) => string;

/**
 * The turn's duration as `1 分 20 秒`, or `undefined` when there is nothing
 * honest to say. History that recorded no timing and a turn that finished
 * inside a second are both unmeasured at this granularity: printing "0 秒"
 * would report a number the app never observed.
 */
export function formatTurnDuration(
  durationMs: number | undefined,
  t: Translate,
): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return undefined;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds <= 0) return undefined;
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remaining = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(t("chat.durationHours", { value: hours }));
  if (minutes > 0) parts.push(t("chat.durationMinutes", { value: minutes }));
  if (remaining > 0) parts.push(t("chat.durationSeconds", { value: remaining }));
  return parts.join(" ");
}
