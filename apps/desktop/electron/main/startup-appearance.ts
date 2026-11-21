/**
 * Startup appearance record (Settings ▸ General ▸ Appearance).
 *
 * The boot splash mounts while the host and the settings record are still
 * starting, so it cannot wait for `settings.get`. This record therefore lives
 * beside the app data directory and is read/written by the main process alone:
 *
 *   <dataDir>/startup-appearance.json    { mode, showLogo, file, name }
 *   <dataDir>/startup-appearance/<file>  the imported SVG/GIF/image
 *
 * Two independent switches share one record: `showLogo` (brand mark on/off) and
 * `mode` (shipped progress bar vs imported animation). `file` is a bare name
 * inside the folder, never an absolute path, so the record stays portable
 * across storage relocation and cannot point at an arbitrary file on disk.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  ErrorCodes,
  STARTUP_ANIMATION_FORMATS,
  STARTUP_ANIMATION_MAX_BYTES,
  type StartupAppearancePatch,
  type StartupAppearancePickResult,
  type StartupAppearanceState,
  type StartupAnimationMode,
} from "@trail/shared";

const CONFIG_FILE = "startup-appearance.json";
const FOLDER = "startup-appearance";
const IMPORTED_BASENAME = "animation";

type StoredChoice = {
  mode: StartupAnimationMode;
  showLogo: boolean;
  file: string | null;
  name: string | null;
};

const configPath = (dataDir: string) => join(dataDir, CONFIG_FILE);
const folderPath = (dataDir: string) => join(dataDir, FOLDER);

function invalid(message: string): Error {
  return Object.assign(new Error(message), { errorCode: ErrorCodes.INVALID_ARGUMENT });
}

function readChoice(dataDir: string): StoredChoice {
  try {
    const raw = JSON.parse(readFileSync(configPath(dataDir), "utf8")) as {
      mode?: unknown;
      showLogo?: unknown;
      file?: unknown;
      name?: unknown;
    };
    return {
      mode:
        raw?.mode === "custom"
          ? "custom"
          : raw?.mode === "critical"
            ? "critical"
            : "default",
      showLogo: raw?.showLogo !== false,
      file: typeof raw?.file === "string" && raw.file.trim() ? basename(raw.file) : null,
      name: typeof raw?.name === "string" && raw.name.trim() ? raw.name : null,
    };
  } catch {
    // Absent, unreadable, or hand-edited: fall back to the shipped appearance.
    return { mode: "default", showLogo: true, file: null, name: null };
  }
}

function writeChoice(dataDir: string, choice: StoredChoice): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(configPath(dataDir), `${JSON.stringify(choice, null, 2)}\n`, "utf8");
}

/** `data:` URL for the stored file, or null when it is missing or unusable. */
function dataUrlFor(dataDir: string, file: string | null): string | null {
  if (!file) return null;
  const mime = STARTUP_ANIMATION_FORMATS[extname(file).toLowerCase()];
  if (!mime) return null;
  const path = join(folderPath(dataDir), basename(file));
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > STARTUP_ANIMATION_MAX_BYTES) return null;
    return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Current choice plus the file payload the splash renders. */
export function readStartupAppearance(dataDir: string): StartupAppearanceState {
  const choice = readChoice(dataDir);
  return {
    mode: choice.mode,
    showLogo: choice.showLogo,
    fileName: choice.file,
    displayName: choice.name,
    dataUrl: dataUrlFor(dataDir, choice.file),
  };
}

/**
 * Write one or both switches. `showLogo` and `mode` are independent: hiding the
 * logo never changes which animation plays, and vice versa.
 */
export function setStartupAppearance(
  dataDir: string,
  patch: StartupAppearancePatch,
): StartupAppearanceState {
  const modes: readonly StartupAnimationMode[] = ["default", "critical", "custom"];
  if (patch.mode !== undefined && !modes.includes(patch.mode)) {
    throw invalid("startupAppearance mode is invalid");
  }
  if (patch.showLogo !== undefined && typeof patch.showLogo !== "boolean") {
    throw invalid("startupAppearance showLogo is invalid");
  }
  const choice = readChoice(dataDir);
  const next: StoredChoice = {
    ...choice,
    ...(patch.mode === undefined ? {} : { mode: patch.mode }),
    ...(patch.showLogo === undefined ? {} : { showLogo: patch.showLogo }),
  };
  writeChoice(dataDir, next);
  return readStartupAppearance(dataDir);
}

/**
 * Copy a picked file into the app data folder and make it the custom
 * animation. Validates format and size before anything is written.
 */
export function importStartupAnimation(
  dataDir: string,
  sourcePath: string,
): StartupAppearancePickResult {
  if (!sourcePath || !existsSync(sourcePath)) {
    throw invalid("startupAppearance source is missing");
  }
  const extension = extname(sourcePath).toLowerCase();
  if (!STARTUP_ANIMATION_FORMATS[extension]) {
    throw invalid("startupAppearance format is unsupported");
  }
  const stat = statSync(sourcePath);
  if (!stat.isFile()) {
    throw invalid("startupAppearance source is not a file");
  }
  if (stat.size > STARTUP_ANIMATION_MAX_BYTES) {
    throw invalid("startupAppearance file is too large");
  }

  const folder = folderPath(dataDir);
  mkdirSync(folder, { recursive: true });
  const fileName = `${IMPORTED_BASENAME}${extension}`;
  const destination = join(folder, fileName);
  if (resolve(sourcePath) !== resolve(destination)) {
    copyFileSync(sourcePath, destination);
  }
  // One imported animation at a time: drop any earlier format so the folder
  // never holds a stale file the record no longer references.
  for (const entry of readdirSync(folder)) {
    if (entry !== fileName) {
      try {
        unlinkSync(join(folder, entry));
      } catch {
        // A read-only leftover must not block switching to the new file.
      }
    }
  }
  const choice = readChoice(dataDir);
  writeChoice(dataDir, { ...choice, mode: "custom", file: fileName, name: basename(sourcePath) });
  return { ...readStartupAppearance(dataDir), canceled: false };
}
