/**
 * Page icon for the app icon style (Settings ▸ General ▸ Appearance ▸ App icon).
 *
 * Inside Electron the window/taskbar icon is a native resource, but the
 * document's `rel="icon"` is what the browser dev build (`dev:web`) shows in
 * its tab and what the packaged window shows for any embedded page view. The
 * renderer already bundles every style, so the switch can repaint it
 * immediately instead of waiting for a launch.
 */
import {
  resolveAppIconAppearance,
  type AppIconAppearance,
  type AppIconStyle,
} from "@trail/shared";
import { api } from "./api";
import { setAppIconState } from "./app-icon-store";
import cloudDarkIconUrl from "../assets/app-icons/cloud-dark.png";
import cloudIconUrl from "../assets/app-icons/cloud.png";
import mascotDarkIconUrl from "../assets/app-icons/mascot-dark.png";
import mascotIconUrl from "../assets/app-icons/mascot.png";
import trailDarkIconUrl from "../assets/app-icons/trail-dark.png";
import trailIconUrl from "../assets/app-icons/trail.png";
// The cloud mark ships its motion artwork too: the same sprite the home screen
// animates, plated onto the style's light/dark tile so a fixed appearance pick
// stays legible on the opposite surface. Renderer-drawn marks (Settings tiles,
// the in-app brand mark, the page icon) use it; the OS window/taskbar/dock icon
// takes one native bitmap and therefore keeps the static PNG resolved by the
// main process.
import cloudMotionDarkUrl from "../assets/app-icons/cloud-motion-dark.gif";
import cloudMotionLightUrl from "../assets/app-icons/cloud-motion-light.gif";

/** Light/dark art per style; styles without a dark artwork repeat the light one. */
export const APP_ICON_URLS: Record<AppIconStyle, Record<"light" | "dark", string>> = {
  trail: { light: trailIconUrl, dark: trailDarkIconUrl },
  mascot: { light: mascotIconUrl, dark: mascotDarkIconUrl },
  cloud: { light: cloudIconUrl, dark: cloudDarkIconUrl },
};

/**
 * Animated light/dark art for styles whose mark moves.
 *
 * Only `cloud` has one today: its still PNG is the first frame of the same
 * sprite. A style without an entry keeps its PNG everywhere.
 */
export const APP_ICON_MOTION_URLS: Partial<
  Record<AppIconStyle, Record<"light" | "dark", string>>
> = {
  cloud: { light: cloudMotionLightUrl, dark: cloudMotionDarkUrl },
};

/** Resolve `auto` against the running page's resolved theme. */
export function isPageDark(): boolean {
  return document.documentElement.dataset.theme !== "light";
}

/** MIME type of a resolved icon URL, so `rel="icon"` matches what it points at. */
export function appIconMimeType(url: string): "image/gif" | "image/png" {
  return url.toLowerCase().endsWith(".gif") ? "image/gif" : "image/png";
}

/**
 * The OS reduced-motion preference. The home mascot already falls back to its
 * still frame for it, so an animated app icon does the same instead of moving
 * for users who asked motion to stop.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * Renderer URL for the picked style, preferring the animated artwork when the
 * style has one. `animated: false` asks for the still frame (the same art the
 * native window icon shows), which keeps a static surface honest.
 */
export function appIconUrl(
  style: AppIconStyle,
  appearance: AppIconAppearance,
  isDark: boolean = isPageDark(),
  animated = !prefersReducedMotion(),
): string {
  const variant = resolveAppIconAppearance(appearance, isDark);
  const motion = animated ? APP_ICON_MOTION_URLS[style]?.[variant] : undefined;
  return motion ?? APP_ICON_URLS[style][variant];
}

export function applyPageIcon(style: AppIconStyle, appearance: AppIconAppearance = "auto"): void {
  const href = appIconUrl(style, appearance);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement("link");
    document.head.append(link);
  }
  link.rel = "icon";
  link.type = appIconMimeType(href);
  link.href = href;
}

/** Apply the stored style on startup; a missing record keeps the bundled one. */
export async function syncPageIcon(): Promise<void> {
  try {
    const state = await api.getAppIcon();
    applyPageIcon(state.style, state.appearance);
    // Warm the shared record so in-app marks (brand logo) paint from it too.
    setAppIconState(state);
  } catch {
    // The shipped icon in index.html stays; a failed read is not worth a toast.
  }
}
