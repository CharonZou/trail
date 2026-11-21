/**
 * Chrome palette presets (Settings ▸ Appearance ▸ 主题模式).
 *
 * The palette itself lives in `styles/tokens.css` as one
 * `[data-chrome-theme]` block per scheme; this module only resolves the stored
 * id and stamps it on the root element. `forest` is the shipped palette, so an
 * absent field and an explicit `forest` paint the same pixels.
 */
import {
  CHROME_THEMES,
  DEFAULT_CHROME_THEME,
  isChromeThemeId,
  type ChromeThemeId,
} from "@trail/shared";

/** Picker order, shared with the Settings row. */
export const CHROME_THEME_OPTIONS: readonly ChromeThemeId[] = CHROME_THEMES;

/** Resolve any stored value to a preset id. */
export function resolveChromeTheme(value: unknown): ChromeThemeId {
  return isChromeThemeId(value) ? value : DEFAULT_CHROME_THEME;
}

/** Paint the selected preset. Safe to call with an absent or stale value. */
export function applyChromeTheme(value?: unknown): ChromeThemeId {
  const theme = resolveChromeTheme(value);
  const root = document.documentElement;
  if (root.dataset.chromeTheme !== theme) {
    root.dataset.chromeTheme = theme;
  }
  return theme;
}
