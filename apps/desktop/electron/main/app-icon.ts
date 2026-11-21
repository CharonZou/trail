/**
 * App icon record (Settings ▸ General ▸ Appearance ▸ App icon).
 *
 * The OS icon cannot be swapped from the renderer: the main process hands it
 * to the window (Windows/Linux) or the dock (macOS) while creating them. The
 * pick is therefore a main-owned record read at launch:
 *
 *   <dataDir>/app-icon.json    { style, appearance }
 *
 * A missing or hand-edited record falls back to the shipped `trail` icon and
 * the `auto` appearance.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_APP_ICON_APPEARANCE,
  ErrorCodes,
  appIconFileName,
  isAppIconAppearance,
  isAppIconStyle,
  type AppIconAppearance,
  type AppIconState,
  type AppIconStyle,
} from "@trail/shared";

const CONFIG_FILE = "app-icon.json";
const FOLDER = "app-icons";

const configPath = (dataDir: string) => join(dataDir, CONFIG_FILE);

function invalid(message: string): Error {
  return Object.assign(new Error(message), { errorCode: ErrorCodes.INVALID_ARGUMENT });
}

function writeRecord(dataDir: string, state: AppIconState): AppIconState {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(configPath(dataDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export function readAppIcon(dataDir: string): AppIconState {
  try {
    const raw = JSON.parse(readFileSync(configPath(dataDir), "utf8")) as {
      style?: unknown;
      appearance?: unknown;
    };
    return {
      style: isAppIconStyle(raw?.style) ? raw.style : "trail",
      appearance: isAppIconAppearance(raw?.appearance)
        ? raw.appearance
        : DEFAULT_APP_ICON_APPEARANCE,
    };
  } catch {
    return { style: "trail", appearance: DEFAULT_APP_ICON_APPEARANCE };
  }
}

export function setAppIcon(dataDir: string, style: unknown): AppIconState {
  if (!isAppIconStyle(style)) throw invalid("appIcon style is invalid");
  return writeRecord(dataDir, { style, appearance: readAppIcon(dataDir).appearance });
}

export function setAppIconAppearance(dataDir: string, appearance: unknown): AppIconState {
  if (!isAppIconAppearance(appearance)) throw invalid("appIcon appearance is invalid");
  return writeRecord(dataDir, { style: readAppIcon(dataDir).style, appearance });
}

export { isAppIconStyle };

/**
 * Absolute path of the bundled icon for `style` and `appearance`.
 *
 * `appearance` is already resolved (`auto` turned into light/dark by the
 * caller, which knows the app's mode). Development builds read the checkout's
 * `build/app-icons`; packaged builds read `resources/app-icons`, which
 * electron-builder copies via `extraResources`.
 */
export function resolveAppIconPath(options: {
  style: AppIconStyle;
  appearance: AppIconAppearance;
  isDevelopmentBuild: boolean;
  appPath: string;
  resourcesPath: string;
  exists: (path: string) => boolean;
}): string | null {
  const root = options.isDevelopmentBuild
    ? join(options.appPath, "build", FOLDER)
    : join(options.resourcesPath, FOLDER);
  const path = join(root, appIconFileName(options.style, options.appearance));
  return options.exists(path) ? path : null;
}
