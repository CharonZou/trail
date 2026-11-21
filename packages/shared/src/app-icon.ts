/**
 * App icon style (Settings ▸ General ▸ Appearance ▸ App icon).
 *
 * The OS icon is not a `BrowserWindow` preference a renderer can change at
 * runtime: it is applied when the window (Windows/Linux) or the dock (macOS)
 * is created. The choice therefore lives in a main-process record beside the
 * app data directory — like the startup appearance — and the main process
 * repaints the live window/dock whenever the user picks another one.
 *
 *   <dataDir>/app-icon.json    { style, appearance }
 *
 * `appearance` only matters for styles that ship both a light and a dark
 * artwork (`APP_ICON_VARIANT_STYLES`); `auto` follows Trail's own 明暗模式.
 */
export const APP_ICON_STYLES = ["trail", "mascot", "cloud"] as const;

/** `trail` is the shipped brand mark; `mascot` is the bundled character icon;
 * `cloud` is the outlined cloud mark bundled with the home mascot animation. */
export type AppIconStyle = (typeof APP_ICON_STYLES)[number];

export const APP_ICON_APPEARANCES = ["light", "dark", "auto"] as const;

/** `auto` follows the app's resolved light/dark mode. */
export type AppIconAppearance = (typeof APP_ICON_APPEARANCES)[number];

/** Styles that bundle a second, dark artwork. */
export const APP_ICON_VARIANT_STYLES: readonly AppIconStyle[] = ["trail", "mascot", "cloud"];

export const DEFAULT_APP_ICON_APPEARANCE: AppIconAppearance = "auto";

export type AppIconState = {
  style: AppIconStyle;
  appearance: AppIconAppearance;
};

export function isAppIconStyle(value: unknown): value is AppIconStyle {
  return typeof value === "string" && (APP_ICON_STYLES as readonly string[]).includes(value);
}

export function isAppIconAppearance(value: unknown): value is AppIconAppearance {
  return typeof value === "string" && (APP_ICON_APPEARANCES as readonly string[]).includes(value);
}

/** Whether the style has a dark artwork, i.e. the appearance row does anything. */
export function supportsAppIconAppearance(style: AppIconStyle): boolean {
  return APP_ICON_VARIANT_STYLES.includes(style);
}

/** Resolve `auto` against the app's resolved mode (dark when `isDark`). */
export function resolveAppIconAppearance(
  appearance: AppIconAppearance,
  isDark: boolean,
): Exclude<AppIconAppearance, "auto"> {
  if (appearance === "auto") return isDark ? "dark" : "light";
  return appearance;
}

/**
 * Bundled file name for a style and resolved appearance.
 *
 * Styles without a dark artwork always answer `<style>.png`; `cloud` answers
 * `cloud-dark.png` for the dark pick and `cloud.png` for the light one.
 */
export function appIconFileName(
  style: AppIconStyle,
  appearance: AppIconAppearance,
): string {
  const variant = resolveAppIconAppearance(appearance, false);
  if (variant === "dark" && supportsAppIconAppearance(style)) return `${style}-dark.png`;
  return `${style}.png`;
}
