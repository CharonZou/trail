import type { CSSProperties } from "react";
import type { ProjectGroupAppearance, ProjectGroupRecord } from "@trail/shared";
import { normalizeProjectPath } from "./sidebar-session-groups";

/**
 * One tile of the workspace-icon row.
 *
 * `value` is the id the host stores, and the first tile stores `null`: a
 * project nobody decorated then writes nothing, so its row keeps the
 * historical folder glyph instead of a copy of it. `value` is also the key into
 * the glyph map in `components/ProjectAppearance.tsx` or, for a supplied glyph,
 * into `PROJECT_UPLOADED_ICON_SHAPES` — this module stays free of `.tsx`
 * imports, because the store imports it and `node --test` cannot load a React
 * component graph.
 */
export type ProjectIconChoice = {
  value: string | null;
  /** Accessible name of the tile, resolved through i18n. */
  labelKey: string;
};

/** One tile of the workspace-color row; `value` is a `#rrggbb` or `null`. */
export type ProjectColorChoice = {
  value: string | null;
  labelKey: string;
};

/**
 * Flattened glyph artwork for an id that has no Lucide component.
 *
 * `viewBox` is square and cut around the glyph's own ink box, and every path
 * paints `currentColor` at `opacity`, so the row's tint reaches these the same
 * way it reaches a stroke icon.
 */
export type ProjectIconShape = {
  viewBox: string;
  paths: { d: string; opacity: number }[];
};

export const PROJECT_ICON_CHOICES: readonly ProjectIconChoice[] = [
  { value: null, labelKey: "project.appearance.icons.folder" },
  { value: "coffee", labelKey: "project.appearance.icons.coffee" },
  { value: "martini", labelKey: "project.appearance.icons.martini" },
  { value: "cake", labelKey: "project.appearance.icons.cake" },
  { value: "moon", labelKey: "project.appearance.icons.moon" },
  { value: "sailboat", labelKey: "project.appearance.icons.sailboat" },
  { value: "bot", labelKey: "project.appearance.icons.bot" },
  { value: "flower", labelKey: "project.appearance.icons.flower" },
  { value: "bug", labelKey: "project.appearance.icons.bug" },
  { value: "leaf", labelKey: "project.appearance.icons.leaf" },
  { value: "cat", labelKey: "project.appearance.icons.cat" },
  { value: "ghost", labelKey: "project.appearance.icons.ghost" },
  { value: "rocket", labelKey: "project.appearance.icons.rocket" },
  { value: "bell", labelKey: "project.appearance.icons.bell" },
  { value: "flask", labelKey: "project.appearance.icons.flask" },
  { value: "cocktail", labelKey: "project.appearance.icons.cocktail" },
  { value: "archive-box", labelKey: "project.appearance.icons.archiveBox" },
  { value: "folder-open", labelKey: "project.appearance.icons.folderOpen" },
  { value: "binders", labelKey: "project.appearance.icons.binders" },
  { value: "box-stack", labelKey: "project.appearance.icons.boxStack" },
  { value: "folder-solid", labelKey: "project.appearance.icons.folderSolid" },
  { value: "tray", labelKey: "project.appearance.icons.tray" },
];

/**
 * Sampled from the reference palette, dark-to-light in the order the picker
 * shows them. The first entry is the theme's own text colour, so an undecorated
 * project matches the chrome it sits in instead of forcing a black swatch.
 */
export const PROJECT_COLOR_CHOICES: readonly ProjectColorChoice[] = [
  { value: null, labelKey: "project.appearance.colors.auto" },
  { value: "#579b6e", labelKey: "project.appearance.colors.green" },
  { value: "#3b81e9", labelKey: "project.appearance.colors.blue" },
  { value: "#efb041", labelKey: "project.appearance.colors.amber" },
  { value: "#ec5b56", labelKey: "project.appearance.colors.red" },
  { value: "#da5597", labelKey: "project.appearance.colors.pink" },
  { value: "#605ce5", labelKey: "project.appearance.colors.indigo" },
  { value: "#f2c647", labelKey: "project.appearance.colors.yellow" },
  { value: "#ea873f", labelKey: "project.appearance.colors.orange" },
  { value: "#55b5a6", labelKey: "project.appearance.colors.teal" },
  { value: "#3f8ef7", labelKey: "project.appearance.colors.sky" },
  { value: "#8e8c98", labelKey: "project.appearance.colors.gray" },
  { value: "#20293a", labelKey: "project.appearance.colors.navy" },
  { value: "#b49ef9", labelKey: "project.appearance.colors.violet" },
  { value: "#7cb196", labelKey: "project.appearance.colors.sage" },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/**
 * A colour this build can render, or `null` for the theme default.
 *
 * The host only checks the shape of the string, so a value written by a newer
 * build (or by hand) reaches here unvalidated. Anything that is not a plain
 * `#rrggbb` is dropped rather than interpolated into a style.
 */
export function resolveProjectColor(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return HEX_COLOR.test(candidate) ? candidate : null;
}

/** Tint for a stored colour, or `undefined` so the glyph keeps `currentColor`. */
export function projectAppearanceStyle(
  appearance?: ProjectGroupAppearance | null,
): CSSProperties | undefined {
  const color = resolveProjectColor(appearance?.color);
  return color ? { color } : undefined;
}

/**
 * The host's group records as a lookup the sidebar rows can use directly.
 *
 * Only decorated projects get an entry: an undecorated one keeps its key
 * absent, so a consumer that misses the lookup still draws the default glyph.
 * A project row is opened through its group's primary path, so that is the key.
 */
export function projectAppearanceByPath(
  groups: readonly ProjectGroupRecord[],
): Record<string, ProjectGroupAppearance> {
  const byPath: Record<string, ProjectGroupAppearance> = {};
  for (const group of groups) {
    if (group.remote) continue;
    const appearance = group.appearance;
    if (!appearance?.icon && !appearance?.color) continue;
    const key = normalizeProjectPath(group.primaryPath);
    if (key) byPath[key] = appearance;
  }
  return byPath;
}
