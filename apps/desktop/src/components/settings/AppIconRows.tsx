/**
 * App icon style + appearance (Settings → General → App icon).
 *
 * The main process repaints the live window/taskbar/dock from the stored
 * record, and this row repaints the page icon, so a pick shows up in the
 * current session; only the OS-level install/shortcut art stays launch-time.
 *
 * One row: the appearance picker sits on the head line, right-aligned, so the
 * style tiles stay the single visual subject. `auto` follows Trail's mode, so
 * the tile previews resolve against the page theme.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  APP_ICON_APPEARANCES,
  APP_ICON_STYLES,
  supportsAppIconAppearance,
  type AppIconAppearance,
  type AppIconState,
  type AppIconStyle,
} from "@trail/shared";
import { api } from "../../lib/api";
import { appIconUrl, applyPageIcon, isPageDark } from "../../lib/app-icon-favicon";
import { setAppIconState } from "../../lib/app-icon-store";
import { useAppStore } from "../../stores/app-store";
import { cx, HelpIcon } from "../ui";
import { IconCheck } from "../icons";
import { SettingsMenuSelect } from "./SettingsMenuSelect";

const ICON_LABEL_KEYS: Record<AppIconStyle, string> = {
  trail: "settings.appIconTrail",
  mascot: "settings.appIconMascot",
  cloud: "settings.appIconCloud",
};

const APPEARANCE_LABEL_KEYS: Record<AppIconAppearance, string> = {
  light: "settings.appIconAppearanceLight",
  dark: "settings.appIconAppearanceDark",
  auto: "settings.appIconAppearanceAuto",
};

export function AppIconRows() {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [state, setState] = useState<AppIconState | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDark, setIsDark] = useState(() => isPageDark());

  useEffect(() => {
    let cancelled = false;
    void api
      .getAppIcon()
      .then((next) => {
        if (!cancelled) {
          setState(next);
          setAppIconState(next);
        }
      })
      .catch(() => {
        // Without the record the shipped icon still launches: no toast for a
        // read that only feeds the selection state.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // `auto` previews against Trail's mode, which the renderer tracks on the
    // root element rather than through a store value.
    const observer = new MutationObserver(() => setIsDark(isPageDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const select = async (style: AppIconStyle) => {
    if (busy || (state?.style ?? "trail") === style) return;
    setBusy(true);
    try {
      const next = await api.setAppIcon(style);
      setState(next);
      setAppIconState(next);
      applyPageIcon(next.style, next.appearance);
      showToast(t("settings.appIconSaved"));
    } catch {
      showToast(t("settings.appIconSaveError"), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const selectAppearance = async (appearance: AppIconAppearance) => {
    if (busy || (state?.appearance ?? "auto") === appearance) return;
    setBusy(true);
    try {
      const next = await api.setAppIconAppearance(appearance);
      setState(next);
      setAppIconState(next);
      applyPageIcon(next.style, next.appearance);
      showToast(t("settings.appIconAppearanceSaved"));
    } catch {
      showToast(t("settings.appIconSaveError"), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const selected = state?.style ?? "trail";
  const appearance = state?.appearance ?? "auto";
  const variantAware = supportsAppIconAppearance(selected);

  return (
    <div className="settings-row settings-row-stacked">
      <div className="app-icon-heading">
        <div className="settings-row-copy">
          <div className="settings-row-title">
            {t("settings.appIconStyle")}
            <HelpIcon label={t("settings.appIconStyleDesc")} />
          </div>
          {state ? (
            <div className="settings-row-detail app-icon-current">
              {t("settings.appIconCurrent", {
                style: t(ICON_LABEL_KEYS[selected]),
                appearance: t(APPEARANCE_LABEL_KEYS[appearance]),
              })}
            </div>
          ) : null}
          <div className="settings-row-detail">{t("settings.appIconStyleHint")}</div>
        </div>
        <div className="app-icon-appearance">
          <span className="app-icon-appearance-label">
            {t("settings.appIconAppearance")}
            <HelpIcon
              label={
                variantAware
                  ? t("settings.appIconAppearanceHint")
                  : t("settings.appIconAppearanceDisabled")
              }
            />
          </span>
          <SettingsMenuSelect
            value={appearance}
            options={APP_ICON_APPEARANCES.map((option) => ({
              id: option,
              label: t(APPEARANCE_LABEL_KEYS[option]),
            }))}
            onChange={(id) => void selectAppearance(id as AppIconAppearance)}
            label={t("settings.appIconAppearance")}
            disabled={!variantAware || busy}
            busy={busy}
          />
        </div>
      </div>
      <div
        className="app-icon-options"
        role="radiogroup"
        aria-label={t("settings.appIconStyle")}
        aria-busy={busy}
      >
        {APP_ICON_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={selected === style}
            aria-label={t(ICON_LABEL_KEYS[style])}
            className={cx("app-icon-option", selected === style && "is-selected")}
            disabled={busy}
            onClick={() => void select(style)}
          >
            <span className="app-icon-preview" aria-hidden="true">
              <img src={appIconUrl(style, appearance, isDark)} alt="" />
              {selected === style ? (
                <span className="app-icon-badge">
                  <IconCheck size={11} />
                </span>
              ) : null}
            </span>
            <span className="app-icon-label">{t(ICON_LABEL_KEYS[style])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
