import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Button } from "../../components/ui";
import { SettingsCard, SettingsRow } from "./primitives";

/**
 * Window commands for the focused Trail window, on every platform.
 *
 * macOS keeps native traffic lights and the rest a frameless titlebar, so the
 * controls are not always visible — this section is the path that is. Both
 * actions run through the same main-process handlers as the native menu, so
 * the fullscreen / maximize interlock (issue #1655) applies here too.
 */
export function WindowActionSection() {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    }
  };

  return (
    <SettingsCard
      title={t("settings.windowActions")}
      description={t("settings.windowActionsDesc")}
    >
      <SettingsRow title={t("settings.windowMinimize")}>
        <Button variant="secondary" onClick={() => void run(() => api.windowControl("minimize"))}>
          {t("window.minimize")}
        </Button>
      </SettingsRow>
      <SettingsRow title={t("settings.windowFullScreen")}>
        <Button
          variant="secondary"
          onClick={() => void run(() => api.nativeMenuAction("toggleFullScreen"))}
        >
          {t("settings.shortcutAction.toggleFullScreen")}
        </Button>
      </SettingsRow>
    </SettingsCard>
  );
}
