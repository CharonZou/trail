import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import {
  KEYBOARD_SHORTCUTS,
  keybindingDisplayParts,
  resolveKeybinding,
  type ShortcutPlatform,
} from "@trail/shared";
import { TooltipButton, cx } from "../../components/ui";
import {
  IconChevronLeft,
  IconChevronRight,
  IconNewSession,
  IconSidebar,
} from "../../components/icons";
import { useAppStore } from "../../stores/app-store";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crash", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-bg-primary p-8 text-text-primary">
          <div className="max-w-lg rounded-lg-plus border border-border-default bg-bg-secondary p-5">
            <div className="mb-2 text-base-plus font-semibold">{i18n.t("app.uiCrashed")}</div>
            <pre className="whitespace-pre-wrap text-sm-plus text-error">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Browser-style history controls for the window titlebar. The store already owns
 * the page/session stack (`navStack` + `navIndex`) and the Alt+Left / Alt+Right
 * shortcuts; this component is only the visible affordance, and it derives its
 * disabled state from the same stack so it can never drift from the shortcuts.
 */
export function HistoryTitlebarActions({
  buttonClassName = "title-nav-btn",
  className,
}: {
  buttonClassName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const navStackLength = useAppStore((state) => state.navStack.length);
  const navIndex = useAppStore((state) => state.navIndex);
  const navBack = useAppStore((state) => state.navBack);
  const navForward = useAppStore((state) => state.navForward);
  const canBack = navIndex > 0;
  const canForward = navIndex < navStackLength - 1;
  const keybindings = useAppStore((state) => state.settings?.keybindings);
  const platform = (
    typeof window === "undefined" ? "darwin" : window.piDesktop?.platform ?? "darwin"
  ) as ShortcutPlatform;
  const shortcutLabel = (id: "navigateBack" | "navigateForward"): string => {
    const shortcut = KEYBOARD_SHORTCUTS.find((entry) => entry.id === id);
    if (!shortcut) return "";
    const parts = keybindingDisplayParts(
      resolveKeybinding(shortcut, keybindings, platform),
      platform,
    );
    return parts.join(platform === "darwin" ? "" : "+");
  };
  const label = (id: "navigateBack" | "navigateForward", text: string): string => {
    const shortcut = shortcutLabel(id);
    return shortcut ? t("nav.actionWithShortcut", { action: text, shortcut }) : text;
  };
  return (
    <div className={cx("titlebar-nav no-drag", className)} role="group">
      <TooltipButton
        type="button"
        className={buttonClassName}
        tooltip={label("navigateBack", t("nav.back"))}
        ariaLabel={t("nav.back")}
        data-nav="nav-back"
        disabled={!canBack}
        onClick={navBack}
      >
        <IconChevronLeft size={15} />
      </TooltipButton>
      <TooltipButton
        type="button"
        className={buttonClassName}
        tooltip={label("navigateForward", t("nav.forward"))}
        ariaLabel={t("nav.forward")}
        data-nav="nav-forward"
        disabled={!canForward}
        onClick={navForward}
      >
        <IconChevronRight size={15} />
      </TooltipButton>
    </div>
  );
}

export function CollapsedTitlebarActions({
  onToggleSidebar,
  onNewTask,
  sidebarToggleShortcut,
}: {
  onToggleSidebar: () => void;
  onNewTask: () => void;
  sidebarToggleShortcut: string;
}) {
  const { t } = useTranslation();
  const toggleLabel = t("nav.expandSidebar");
  return (
    <div className="titlebar-nav no-drag">
      <TooltipButton
        className="title-nav-btn"
        tooltip={
          sidebarToggleShortcut
            ? `${toggleLabel} (${sidebarToggleShortcut})`
            : toggleLabel
        }
        ariaLabel={toggleLabel}
        aria-expanded={false}
        data-nav="toggle-sidebar"
        onClick={onToggleSidebar}
      >
        <IconSidebar size={15} />
      </TooltipButton>
      <TooltipButton
        className="title-nav-btn"
        tooltip={t("nav.newTask")}
        ariaLabel={t("nav.newTask")}
        data-nav="new-task"
        onClick={onNewTask}
      >
        <IconNewSession size={15} />
      </TooltipButton>
    </div>
  );
}

export function RoutePending() {
  const { t } = useTranslation();
  return (
    <div className="route-pending" role="status" aria-label={t("app.loadingView")}>
      <span className="route-pending-indicator" aria-hidden />
    </div>
  );
}
