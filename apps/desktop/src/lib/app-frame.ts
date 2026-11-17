import type { AppSettings } from "@trail/shared";

/** How the main window frames its panes, as the shell and the row both see it. */
export type AppFrame = NonNullable<AppSettings["appFrame"]>;

/**
 * An absent preference is the shipped continuous surface, so upgrading never
 * changes what an existing profile already sees.
 *
 * One resolver because the Appearance row and the shell read the same persisted
 * field: the row shows which plate is selected and `AppShell` decides whether
 * the main pane gets its own inset plate. The Settings page has a separate
 * tier (`settingsLayout`), which this never touches.
 */
export function appFrameOf(
  settings: Pick<AppSettings, "appFrame"> | null | undefined,
): AppFrame {
  return settings?.appFrame === "floating" ? "floating" : "window";
}
