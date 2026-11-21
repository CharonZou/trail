/**
 * Startup appearance surface (Settings ▸ General ▸ Appearance).
 *
 * Two independent things decide what the boot splash shows: whether the brand
 * logo appears, and which animation fills its loading area (the shipped
 * progress bar, or an imported file).
 *
 * Both have to be readable before the host and the settings record are available
 * — the splash appears while both are still starting — so the desktop main
 * process owns this small record (a JSON file beside the imported animation in
 * the app data directory) instead of `AppSettings`. The renderer mirrors it into
 * local state only to render the Settings rows.
 */

/**
 * Built-in animations: the shipped progress bar (`default`) and the bundled
 * "critical bar" pulse (`critical`). `custom` is whatever the user imported.
 */
export type StartupAnimationPreset = "default" | "critical";
export type StartupAnimationMode = StartupAnimationPreset | "custom";

export type StartupAppearanceState = {
  /** Which animation fills the splash's loading area. */
  mode: StartupAnimationMode;
  /** The brand logo on the splash; absent resolves to true. */
  showLogo: boolean;
  /** File name inside the app data `startup-appearance` folder, when custom. */
  fileName: string | null;
  /** Name the file had when the user picked it, for the Settings card. */
  displayName: string | null;
  /** `data:` URL of the chosen file for the splash `<img>`; null when absent. */
  dataUrl: string | null;
};

export type StartupAppearancePickResult = StartupAppearanceState & {
  /** The file dialog was dismissed; the stored choice is unchanged. */
  canceled: boolean;
};

/** Partial write for the two independent switches. */
export type StartupAppearancePatch = {
  mode?: StartupAnimationMode;
  showLogo?: boolean;
};

/**
 * Import formats, keyed by lowercase extension. The splash renders the file
 * through an `<img>`, so only image formats are accepted — a video or a
 * generic document would need a different playback surface.
 */
export const STARTUP_ANIMATION_FORMATS: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Import ceiling: the splash inlines the file as a `data:` URL. */
export const STARTUP_ANIMATION_MAX_BYTES = 8 * 1024 * 1024;

/** Extensions offered by the import dialog (without the leading dot). */
export const STARTUP_ANIMATION_DIALOG_EXTENSIONS = Object.keys(
  STARTUP_ANIMATION_FORMATS,
).map((extension) => extension.slice(1));
