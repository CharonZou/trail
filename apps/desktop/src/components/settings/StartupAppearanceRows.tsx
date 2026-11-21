/**
 * Startup appearance (Settings → General → Appearance).
 *
 * One row, one surface: the animation title leads the card, the logo switch
 * closes the same head line, and three preview cards choose the animation that
 * fills the splash's loading area — the shipped progress bar, the bundled
 * "critical bar" pulse, or the user's own file.
 *
 * Both settings are stored by the desktop main process rather than in
 * `AppSettings`, because the splash mounts before the host and the settings
 * record exist — see `electron/main/startup-appearance.ts`.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  StartupAnimationMode,
  StartupAppearancePatch,
  StartupAppearanceState,
} from "@trail/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { cx, HelpIcon, SettingsToggle } from "../ui";
import { IconCheck, IconImage } from "../icons";
import criticalBarUrl from "../../assets/startup/critical-bar.svg";

export function StartupAppearanceRows() {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [choice, setChoice] = useState<StartupAppearanceState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .getStartupAppearance()
      .then((next) => {
        if (!cancelled) setChoice(next);
      })
      .catch(() => {
        // The splash itself still works: it falls back to the shipped surface.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const write = async (patch: StartupAppearancePatch) => {
    if (busy) return;
    setBusy(true);
    try {
      setChoice(await api.setStartupAppearance(patch));
    } catch {
      showToast(t("settings.startupAppearanceSaveError"), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.pickStartupAnimation();
      if (result.canceled) return;
      const { canceled: _canceled, ...next } = result;
      setChoice(next);
    } catch {
      showToast(t("settings.startupAppearancePickError"), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  // The logo switch is its own preference; an absent record shows it.
  const logoShown = choice?.showLogo !== false;
  // A custom mode whose file went missing is not a usable selection.
  const mode: StartupAnimationMode =
    choice?.mode === "custom" && !choice.dataUrl ? "default" : (choice?.mode ?? "default");

  const choosePreset = (preset: StartupAnimationMode) => {
    if (mode === preset) return;
    void write({ mode: preset });
  };

  // Choosing "custom" with no file yet is the import: the dialog is the only
  // thing that can make that card meaningful.
  const chooseCustom = () => {
    if (mode === "custom") return;
    if (!choice?.dataUrl) {
      void pickFile();
      return;
    }
    void write({ mode: "custom" });
  };

  const badge = (
    <span className="startup-animation-badge" aria-hidden="true">
      <IconCheck size={11} />
    </span>
  );

  return (
    <div className="settings-row settings-row-stacked">
      <div className="startup-animation-heading">
        <div className="settings-row-title">
          {t("settings.startupAnimation")}
          <HelpIcon label={t("settings.startupAnimationDesc")} />
        </div>
        <div className="startup-logo-switch">
          <span className="startup-logo-switch-label">
            {t("settings.startupLogo")}
            <HelpIcon label={t("settings.startupLogoDesc")} />
          </span>
          <SettingsToggle
            checked={logoShown}
            busy={busy}
            label={t("settings.startupLogo")}
            onChange={() => void write({ showLogo: !logoShown })}
          />
        </div>
      </div>
      <div className="startup-animation">
        <div
          className="startup-animation-options"
          role="radiogroup"
          aria-label={t("settings.startupAnimation")}
          aria-busy={busy}
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === "default"}
            aria-label={t("settings.startupAnimationDefault")}
            className={cx("startup-animation-option", mode === "default" && "is-selected")}
            disabled={busy}
            onClick={() => choosePreset("default")}
          >
            {/* Each default previews what it actually plays, so the three
                cards never read as variants of the same thing. */}
            <span className="startup-animation-preview" aria-hidden="true">
              <span className="startup-animation-preview-track">
                <span className="startup-animation-preview-bar" />
              </span>
            </span>
            <span className="startup-animation-label">
              {t("settings.startupAnimationDefault")}
            </span>
            {mode === "default" ? badge : null}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "critical"}
            aria-label={t("settings.startupAnimationCritical")}
            className={cx("startup-animation-option", mode === "critical" && "is-selected")}
            disabled={busy}
            onClick={() => choosePreset("critical")}
          >
            <span className="startup-animation-preview" aria-hidden="true">
              <img src={criticalBarUrl} alt="" />
            </span>
            <span className="startup-animation-label">
              {t("settings.startupAnimationCritical")}
            </span>
            {mode === "critical" ? badge : null}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "custom"}
            aria-label={t("settings.startupAnimationCustom")}
            className={cx("startup-animation-option", mode === "custom" && "is-selected")}
            disabled={busy}
            onClick={chooseCustom}
          >
            <span className="startup-animation-preview" aria-hidden="true">
              {choice?.dataUrl ? (
                <img src={choice.dataUrl} alt="" />
              ) : (
                <IconImage size={20} className="startup-animation-placeholder" />
              )}
            </span>
            <span className="startup-animation-label">
              {t("settings.startupAnimationCustom")}
            </span>
            {mode === "custom" ? badge : null}
          </button>
        </div>
        {mode === "custom" ? (
          <div className="startup-animation-file">
            <span className="startup-animation-file-name" title={choice?.displayName ?? undefined}>
              {choice?.displayName ?? choice?.fileName}
            </span>
            <button
              type="button"
              className="startup-animation-file-action"
              onClick={() => void pickFile()}
              disabled={busy}
            >
              {t("settings.startupAnimationChange")}
            </button>
          </div>
        ) : (
          <p className="startup-animation-hint">{t("settings.startupAnimationHint")}</p>
        )}
      </div>
    </div>
  );
}
