/**
 * Runtime app icon swap (Settings ▸ General ▸ Appearance ▸ App icon).
 *
 * The stored style/appearance is applied at launch (window creation on
 * Windows/Linux, dock on macOS), and this module applies the same PNG the
 * moment the user picks another style or appearance, so the running window,
 * taskbar entry and macOS dock follow without a restart.
 *
 * `auto` is resolved here against `nativeTheme.shouldUseDarkColors`, which the
 * app already keeps in sync with Trail's own 明暗模式 (`themeSource`).
 *
 * The page/tab icon is a renderer concern — see `src/lib/app-icon-favicon.ts`.
 */
import { existsSync } from "node:fs";
import { app, BrowserWindow, nativeImage, nativeTheme } from "electron";
import {
  resolveAppIconAppearance,
  type AppIconAppearance,
  type AppIconStyle,
} from "@trail/shared";
import { resolveAppIconPath } from "./app-icon";

export type AppIconRuntimeOptions = {
  style: AppIconStyle;
  appearance: AppIconAppearance;
  isDevelopmentBuild: boolean;
};

export type AppIconRuntimeResult =
  | { applied: true; path: string }
  | { applied: false; reason: "missing" | "unreadable" };

export function applyWindowIcon({
  style,
  appearance,
  isDevelopmentBuild,
}: AppIconRuntimeOptions): AppIconRuntimeResult {
  const resolved = resolveAppIconAppearance(appearance, nativeTheme.shouldUseDarkColors);
  const path = resolveAppIconPath({
    style,
    appearance: resolved,
    isDevelopmentBuild,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    exists: existsSync,
  });
  if (!path) return { applied: false, reason: "missing" };

  const icon = nativeImage.createFromPath(path);
  if (icon.isEmpty()) return { applied: false, reason: "unreadable" };

  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(icon);
    return { applied: true, path };
  }

  // `setIcon` covers the window frame, taskbar entry and the window switcher
  // on Windows/Linux; hidden windows keep the new icon for their next show.
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.setIcon(icon);
  }
  return { applied: true, path };
}
