import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { TooltipButton, cx } from "./ui";
import { BrandLogo } from "./BrandLogo";
import { NotificationCenter } from "./NotificationCenter";
import {
  IconBookOpen,
  IconBrowser,
  IconChat,
  IconClock,
  IconDatabase,
  IconPlug,
  IconSettings,
} from "./icons";

/**
 * Collapsed shell rail — the icon-only face of the sidebar.
 *
 * The sidebar unmounts when it collapses, which used to leave the shell's left
 * edge empty and push every destination behind the titlebar. This rail keeps a
 * 56px plate in that slot: brand, the four extension destinations, then the
 * footer cluster behind a hairline divider, so the collapsed shell still shows
 * where you are (`aria-pressed` + the active tile) and every destination is one
 * click away.
 *
 * It renders on the shell ground rather than over the sheet, so both window
 * frames read the same: `window` shares one plane with the sidebar, and
 * `floating` plates the rail together with the chrome band around the sheet.
 * The rail therefore takes no `background` of its own beyond the shared
 * `.sidebar-rail` surface rule in `chrome.css`.
 */
export function SidebarRail({ className }: { className?: string }) {
  const { t } = useTranslation();
  const page = useAppStore((state) => state.page);
  const setPage = useAppStore((state) => state.setPage);
  const navBack = useAppStore((state) => state.navBack);
  const canNavBack = useAppStore((state) => state.canNavBack);

  /* Same affordance as the expanded extensions list: pressing the current
   * destination steps back through history, and an empty stack lands on chat,
   * so the rail can never trap the user on a page with no way home. */
  const visit = (target: typeof page) => {
    if (page === target) {
      if (canNavBack()) navBack();
      else setPage("chat");
      return;
    }
    setPage(target);
  };

  const item = (
    target: typeof page,
    navId: string,
    label: string,
    icon: ReactNode,
  ) => (
    <TooltipButton
      type="button"
      className={cx("sidebar-rail-btn", page === target && "active")}
      tooltip={label}
      ariaLabel={label}
      aria-pressed={page === target}
      data-nav={navId}
      onClick={() => visit(target)}
    >
      {icon}
    </TooltipButton>
  );

  return (
    <aside
      className={cx("sidebar-rail", className)}
      aria-label={t("app.shellName")}
    >
      <div className="sidebar-rail-brand" aria-hidden>
        <BrandLogo size={22} />
      </div>
      <div className="sidebar-rail-group">
        {item("chat", "home", t("nav.home"), <IconChat size={18} />)}
        {item("assets", "assets", t("assets.title"), <IconDatabase size={18} />)}
        {item("plugins", "plugins", t("nav.plugins"), <IconPlug size={18} />)}
        {item("knowledge", "knowledge", t("knowledge.title"), <IconBookOpen size={18} />)}
        {item("apps", "apps", t("agentApps.title"), <IconBrowser size={18} />)}
      </div>
      <div className="sidebar-rail-spacer" aria-hidden />
      <div className="sidebar-rail-divider" aria-hidden />
      <div className="sidebar-rail-group">
        {item("settings", "settings", t("nav.settings"), <IconSettings size={18} />)}
        {item("scheduled", "scheduled", t("scheduled.title"), <IconClock size={18} />)}
        <NotificationCenter iconSize={18} />
      </div>
    </aside>
  );
}
