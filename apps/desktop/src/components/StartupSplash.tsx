import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StartupAppearanceState } from "@trail/shared";
import { api } from "../lib/api";
import { BrandLogo } from "./BrandLogo";
import { cx } from "./ui";
import criticalBarUrl from "../assets/startup/critical-bar.svg";

/** Full-window boot surface shown until host/settings bootstrap finishes. */
export function StartupSplash({ exiting = false }: { exiting?: boolean }) {
  const { t } = useTranslation();
  // The user's startup appearance: whether the brand mark shows, and which
  // animation fills the loading area. It comes from the main-process record
  // (not host settings), so it is readable this early; the shipped surface
  // stays the fallback for the whole lifetime of this component.
  const [appearance, setAppearance] = useState<StartupAppearanceState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .getStartupAppearance()
      .then((next) => {
        if (!cancelled) setAppearance(next);
      })
      .catch(() => {
        // A missing record must never block the boot surface.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logoShown = appearance?.showLogo !== false;
  // The bundled "critical bar" preset ships with the app, so it needs no file
  // record; only a custom choice carries a `data:` URL.
  const animationSrc =
    appearance?.mode === "custom"
      ? appearance.dataUrl
      : appearance?.mode === "critical"
        ? criticalBarUrl
        : null;

  return (
    <div
      className={cx("startup-splash", exiting && "is-exiting")}
      role="status"
      aria-live="polite"
      aria-busy={!exiting}
      data-testid="startup-splash"
    >
      <div className="startup-splash-card">
        {logoShown ? (
          <div className="startup-splash-mark" aria-hidden>
            <BrandLogo size={64} />
          </div>
        ) : null}
        {/* Name only: the product line belongs to the app, not to the boot
            surface, so the splash stays a wordmark plus a load indicator. */}
        <div className="startup-splash-copy">
          <div className="startup-splash-name">{t("app.shellName")}</div>
        </div>
        {animationSrc ? (
          <div className="startup-splash-stage" aria-hidden>
            <img className="startup-splash-animation" src={animationSrc} alt="" />
          </div>
        ) : (
          <div className="startup-splash-track" aria-hidden>
            <span className="startup-splash-bar" />
          </div>
        )}
        <span className="sr-only">{t("app.starting")}</span>
      </div>
    </div>
  );
}
