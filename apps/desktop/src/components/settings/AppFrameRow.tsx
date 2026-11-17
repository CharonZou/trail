import { useTranslation } from "react-i18next";
import type { AppSettings } from "@trail/shared";
import { SegmentedControl } from "../ui";
import { SettingsRow } from "../../features/settings/primitives";
import { appFrameOf } from "../../lib/app-frame";

/**
 * Main-window frame (Settings → General → Appearance ▸ 界面排版).
 *
 * `window` is the shipped continuous surface; `floating` gives the main pane its
 * own rounded plate over a recessed shell ground, so the sidebar and the work
 * area read as separate plates. The row writes `AppSettings.appFrame` and
 * nothing else — no destination, control, or stored value changes.
 *
 * This is not the Settings page's own size tier: that one stays on
 * `AppSettings.settingsLayout`, set from the chrome button in its title band.
 */
export function AppFrameRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const current = appFrameOf(settings);

  return (
    <SettingsRow title={t("settings.appFrame")} description={t("settings.appFrameDesc")}>
      <SegmentedControl
        value={current}
        onChange={(value) => void saveSettings({ appFrame: value })}
        options={[
          { value: "window", label: t("settings.appFrameWindow") },
          { value: "floating", label: t("settings.appFrameFloating") },
        ]}
        label={t("settings.appFrame")}
      />
    </SettingsRow>
  );
}
