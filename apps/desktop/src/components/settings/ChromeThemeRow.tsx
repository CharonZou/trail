/**
 * Chrome palette preset picker (Settings → Appearance → 主题模式).
 *
 * A preset recolours the window chrome — the sidebar plate and its vertical
 * gradient, the settings rail, and the content pane's paper — and nothing
 * else. The colours are token blocks in `styles/tokens.css`; each tile carries
 * the same `data-chrome-theme` id, so the tile previews the preset's real
 * tokens instead of a hand-drawn swatch.
 *
 * The pick applies at once (the effect in the app-shell runtime stamps the
 * attribute), so the window repaints before the save resolves and a failed
 * write leaves the previous palette in place on the next load.
 */
import { useTranslation } from "react-i18next";
import type { AppSettings, ChromeThemeId } from "@trail/shared";
import {
  CHROME_THEME_OPTIONS,
  applyChromeTheme,
  resolveChromeTheme,
} from "../../lib/chrome-theme";
import { cx, HelpIcon } from "../ui";

const THEME_LABEL_KEYS: Record<ChromeThemeId, string> = {
  forest: "settings.chromeThemeForest",
  mint: "settings.chromeThemeMint",
  honey: "settings.chromeThemeHoney",
  parchment: "settings.chromeThemeParchment",
};

export function ChromeThemeRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const selected = resolveChromeTheme(settings.chromeTheme);

  const choose = (id: ChromeThemeId) => {
    if (id === selected) return;
    applyChromeTheme(id);
    void saveSettings({ chromeTheme: id }).catch(() => {
      // The store keeps the previous value, so the next settings load puts the
      // old palette back; the immediate repaint needs no rollback of its own.
      applyChromeTheme(settings.chromeTheme);
    });
  };

  return (
    <div className="settings-row settings-row-stacked">
      <div className="settings-row-copy">
        <div className="settings-row-title">
          {t("settings.chromeTheme")}
          <HelpIcon label={t("settings.chromeThemeDesc")} />
        </div>
        <div className="settings-row-detail">{t("settings.chromeThemeHint")}</div>
      </div>
      <div
        className="chrome-theme-options"
        role="radiogroup"
        aria-label={t("settings.chromeTheme")}
      >
        {CHROME_THEME_OPTIONS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected === id}
            aria-label={t(THEME_LABEL_KEYS[id])}
            className={cx("chrome-theme-option", selected === id && "is-selected")}
            onClick={() => choose(id)}
          >
            <span
              className="chrome-theme-tile"
              data-chrome-theme={id}
              aria-hidden="true"
            >
              <span className="chrome-theme-tile-accent" />
              <span className="chrome-theme-tile-dot" />
              <span className="chrome-theme-tile-sheet">
                <span className="chrome-theme-tile-line" />
                <span className="chrome-theme-tile-line is-short" />
              </span>
            </span>
            <span className="chrome-theme-label">{t(THEME_LABEL_KEYS[id])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
