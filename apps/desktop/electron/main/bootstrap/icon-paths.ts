import { join } from "node:path";

/**
 * Inputs that decide which brand asset backs the Windows window icon and the
 * tray icon.
 */
export type IconPathLookup = {
  /**
   * Build mode from `installation.ts`: `TRAIL_DEV=1` or an unpackaged Electron
   * runtime. Never derive this from `app.isPackaged` at the call site — an
   * environment that injects `ELECTRON_FORCE_IS_PACKAGED` makes a development
   * launch report `isPackaged === true`, and `process.resourcesPath` then
   * points at the Electron runtime instead of the checkout carrying `build/`.
   */
  isDevelopmentBuild: boolean;
  platform: NodeJS.Platform;
  /** `app.getAppPath()`: the checkout that holds the development assets. */
  appPath: string;
  /** `process.resourcesPath`: the packaged `resources` directory. */
  resourcesPath: string;
  exists: (path: string) => boolean;
};

function assetRoot({
  isDevelopmentBuild,
  appPath,
  resourcesPath,
}: IconPathLookup): string {
  return isDevelopmentBuild ? join(appPath, "build") : resourcesPath;
}

function firstExisting(
  candidates: string[],
  exists: (path: string) => boolean,
): string | null {
  return candidates.find((candidate) => exists(candidate)) ?? null;
}

/** The `BrowserWindow` icon on Windows, or `null` on other platforms. */
export function resolveWindowIconPath(lookup: IconPathLookup): string | null {
  if (lookup.platform !== "win32") return null;

  const fileName = lookup.isDevelopmentBuild ? "icon.ico" : "app-icon.ico";
  return firstExisting(
    [join(assetRoot(lookup), fileName)],
    lookup.exists,
  );
}

/** The first tray asset that exists, or `null` when none does. */
export function resolveTrayIconPath(lookup: IconPathLookup): string | null {
  const root = assetRoot(lookup);
  const fileName = lookup.isDevelopmentBuild ? "icon.png" : "tray-icon.png";
  const candidates =
    lookup.platform === "darwin"
      ? [join(root, "tray-icon-mac.png"), join(root, fileName)]
      : [join(root, fileName)];
  return firstExisting(candidates, lookup.exists);
}
