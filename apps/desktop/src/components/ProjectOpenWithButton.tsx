import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpenWithApp, OpenWithEditorApp } from "@trail/shared";
import { OPEN_WITH_APPS } from "@trail/shared";
import explorerIconUrl from "../assets/open-with/explorer.png";
import ideaIconUrl from "../assets/open-with/idea.png";
import traeIconUrl from "../assets/open-with/trae.png";
import vscodeIconUrl from "../assets/open-with/vscode.png";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { AnchoredMenu } from "./settings/AnchoredMenu";
import { TooltipButton } from "./ui";
import { IconCheck, IconChevronDown } from "./icons";

/*
 * Trademarks are not translated, so the three editors keep their vendor names
 * here; the file manager is a role, so its label comes from the catalogs.
 */
const EDITOR_NAMES: Record<OpenWithEditorApp, string> = {
  vscode: "VS Code",
  trae: "Trae",
  idea: "IntelliJ IDEA",
};

/*
 * The vendor's own shipped app icons, not host-drawn approximations: the row's
 * job is that the picture names the program, so the real mark wins over a
 * theme-tinted glyph. They keep their literal colors by design.
 */
const OPEN_WITH_ICONS: Record<OpenWithApp, string> = {
  explorer: explorerIconUrl,
  vscode: vscodeIconUrl,
  trae: traeIconUrl,
  idea: ideaIconUrl,
};

function OpenWithIcon({ app }: { app: OpenWithApp }) {
  return (
    <img
      className="project-open-with-icon"
      src={OPEN_WITH_ICONS[app]}
      alt=""
      aria-hidden="true"
      width={14}
      height={14}
      draggable={false}
    />
  );
}

/**
 * Open the conversation's project folder in a program the user already has.
 *
 * The left half uses the remembered choice, so the control behaves like the
 * file-manager button it was before the first menu press; the caret opens the
 * fixed list. Only the four ids in `OPEN_WITH_APPS` are ever offered, and the
 * main process resolves each one from fixed install roots — the renderer never
 * names an executable.
 */
export function ProjectOpenWithButton({
  projectPath,
}: {
  projectPath?: string | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const settings = useAppStore((s) => s.settings);
  const showToast = useAppStore((s) => s.showToast);
  const lastApp: OpenWithApp = settings?.openWithLastApp ?? "explorer";
  const fileManagerName = t("project.openWithFileManager");
  const lastAppName =
    lastApp === "explorer" ? fileManagerName : EDITOR_NAMES[lastApp];

  /* The write is best-effort: a failed preference must not swallow the open. */
  const remember = async (app: OpenWithApp) => {
    const current = useAppStore.getState().settings;
    if (!current || current.openWithLastApp === app) return;
    const payload = { ...current, openWithLastApp: app };
    try {
      await api.setSettings(payload);
      useAppStore.setState({ settings: payload });
    } catch {
      /* The next press retries. */
    }
  };

  const reportFailure = (
    reason: "not_installed" | "launch_failed",
    editor: OpenWithEditorApp,
  ) => {
    const app = EDITOR_NAMES[editor];
    showToast(
      reason === "not_installed"
        ? t("project.openAppNotInstalled", { app })
        : t("project.openAppLaunchFailed", { app }),
      { variant: "error" },
    );
  };

  const openIn = async (app: OpenWithApp) => {
    if (!projectPath) return;
    setOpen(false);
    void remember(app);
    try {
      if (app === "explorer") {
        await api.openProjectFolder(projectPath);
        return;
      }
      const result = await api.openProjectWith(app, projectPath);
      if (!result.ok) reportFailure(result.reason, app);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), {
        variant: "error",
      });
    }
  };

  if (!projectPath) return null;

  return (
    <AnchoredMenu
      className="ct-open-with"
      open={open}
      onClose={() => setOpen(false)}
      menuClassName="project-open-with-menu"
      label={t("project.openWithMenu")}
      role="menu"
      align="end"
      trigger={(ref) => (
        <>
          <TooltipButton
            type="button"
            className="ct-open-with-main"
            tooltip={t("project.openWithApp", { app: lastAppName })}
            ariaLabel={t("project.openWithApp", { app: lastAppName })}
            onClick={() => void openIn(lastApp)}
          >
            <OpenWithIcon app={lastApp} />
            <span className="ct-open-with-label">{t("project.openWith")}</span>
          </TooltipButton>
          <TooltipButton
            ref={ref}
            type="button"
            className="ct-open-with-caret"
            tooltip={t("project.openWithMenu")}
            ariaLabel={t("project.openWithMenu")}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <IconChevronDown size={11} aria-hidden="true" />
          </TooltipButton>
        </>
      )}
    >
      {OPEN_WITH_APPS.map((app) => {
        const label = app === "explorer" ? fileManagerName : EDITOR_NAMES[app];
        const selected = app === lastApp;
        return (
          <button
            key={app}
            type="button"
            role="menuitem"
            className="project-open-with-item"
            aria-current={selected ? "true" : undefined}
            aria-label={
              selected ? `${label} · ${t("project.openWithDefault")}` : label
            }
            title={t("project.openWithApp", { app: label })}
            onClick={() => void openIn(app)}
          >
            <OpenWithIcon app={app} />
            <span className="project-open-with-name">{label}</span>
            {selected ? (
              <span className="project-open-with-check" aria-hidden="true">
                <IconCheck size={13} />
              </span>
            ) : null}
          </button>
        );
      })}
    </AnchoredMenu>
  );
}
