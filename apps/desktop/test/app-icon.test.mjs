/**
 * App icon style + appearance (Settings ▸ General ▸ App icon).
 *
 * The OS icon is handed to the window/dock at creation, so the contract is:
 * a main-owned record, read at launch, backed by bundled per-style PNGs that
 * both the Settings preview and the packaged build see. Styles that bundle a
 * dark artwork expose an appearance row; `auto` follows Trail's own mode.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const LANGS = ["en", "zh-CN", "zh-TW", "de", "es", "fr", "ko", "pt-BR", "tr"];

const [
  protocol,
  settingsIpc,
  registerSource,
  runtimeSource,
  rows,
  settingsPage,
  windowSource,
  lifecycle,
  packageJson,
  styles,
  entry,
  html,
  brandLogo,
  iconStore,
] = await Promise.all([
  read("../../../packages/shared/src/protocol.ts"),
  read("../electron/main/ipc/settings-ipc.ts"),
  read("../electron/main/ipc/register.ts"),
  read("../electron/main/app-icon-runtime.ts"),
  read("../src/components/settings/AppIconRows.tsx"),
  read("../src/features/settings/SettingsPage.tsx"),
  read("../electron/main/bootstrap/window.ts"),
  read("../electron/main/bootstrap/app-lifecycle.ts"),
  read("../package.json"),
  read("../src/styles/settings.css"),
  read("../src/main.tsx"),
  read("../index.html"),
  read("../src/components/BrandLogo.tsx"),
  read("../src/lib/app-icon-store.ts"),
]);

const catalogs = await Promise.all(
  LANGS.map((lang) => read(`../../../packages/i18n/src/locales/${lang}/index.ts`)),
);

const tempDir = () => mkdtempSync(join(tmpdir(), "trail-app-icon-"));

test("an absent or hand-edited record falls back to the shipped icon", async () => {
  const { readAppIcon } = await import("../electron/main/app-icon.ts");
  const dir = tempDir();
  assert.deepEqual(readAppIcon(dir), { style: "trail", appearance: "auto" });

  writeFileSync(join(dir, "app-icon.json"), '{"style":"nope","appearance":"sepia"}', "utf8");
  assert.deepEqual(readAppIcon(dir), { style: "trail", appearance: "auto" });

  writeFileSync(join(dir, "app-icon.json"), "not json", "utf8");
  assert.deepEqual(readAppIcon(dir), { style: "trail", appearance: "auto" });
});

test("a stored style survives a reread and keeps the stored appearance", async () => {
  const { readAppIcon, setAppIcon, setAppIconAppearance } = await import(
    "../electron/main/app-icon.ts"
  );
  const dir = tempDir();
  assert.deepEqual(setAppIconAppearance(dir, "dark"), { style: "trail", appearance: "dark" });
  assert.deepEqual(setAppIcon(dir, "mascot"), { style: "mascot", appearance: "dark" });
  assert.deepEqual(readAppIcon(dir), { style: "mascot", appearance: "dark" });
  assert.deepEqual(setAppIconAppearance(dir, "light"), { style: "mascot", appearance: "light" });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "app-icon.json"), "utf8")), {
    style: "mascot",
    appearance: "light",
  });
});

test("an unknown style or appearance is rejected instead of silently stored", async () => {
  const { setAppIcon, setAppIconAppearance } = await import("../electron/main/app-icon.ts");
  const { ErrorCodes } = await import("@trail/shared");
  const dir = tempDir();
  for (const bad of ["", "Trail", "blue", null, 7]) {
    assert.throws(
      () => setAppIcon(dir, bad),
      (error) => error?.errorCode === ErrorCodes.INVALID_ARGUMENT,
    );
    assert.throws(
      () => setAppIconAppearance(dir, bad),
      (error) => error?.errorCode === ErrorCodes.INVALID_ARGUMENT,
    );
  }
  assert.equal(existsSync(join(dir, "app-icon.json")), false);
});

test("each style resolves to the bundled PNG for the running build", async () => {
  const { resolveAppIconPath } = await import("../electron/main/app-icon.ts");
  const devRoot = join("/repo/apps/desktop", "build", "app-icons");
  const packagedRoot = join("/repo/apps/desktop/resources", "app-icons");
  const api = {
    isDevelopmentBuild: true,
    appPath: "/repo/apps/desktop",
    resourcesPath: "/repo/apps/desktop/resources",
    exists: (path) =>
      path === join(devRoot, "trail.png") ||
      path === join(devRoot, "trail-dark.png") ||
      path === join(devRoot, "mascot.png") ||
      path === join(devRoot, "mascot-dark.png") ||
      path === join(devRoot, "cloud.png") ||
      path === join(devRoot, "cloud-dark.png"),
  };
  assert.equal(
    resolveAppIconPath({ ...api, style: "trail", appearance: "light" }),
    join(devRoot, "trail.png"),
  );
  assert.equal(
    resolveAppIconPath({ ...api, style: "mascot", appearance: "light" }),
    join(devRoot, "mascot.png"),
  );
  assert.equal(
    resolveAppIconPath({ ...api, style: "cloud", appearance: "light" }),
    join(devRoot, "cloud.png"),
  );
  // Every bundled style ships a dark artwork, so the appearance splits them all.
  assert.equal(
    resolveAppIconPath({ ...api, style: "cloud", appearance: "dark" }),
    join(devRoot, "cloud-dark.png"),
  );
  assert.equal(
    resolveAppIconPath({ ...api, style: "trail", appearance: "dark" }),
    join(devRoot, "trail-dark.png"),
  );
  assert.equal(
    resolveAppIconPath({ ...api, style: "mascot", appearance: "dark" }),
    join(devRoot, "mascot-dark.png"),
  );

  const packaged = { ...api, isDevelopmentBuild: false, exists: () => true };
  assert.equal(
    resolveAppIconPath({ ...packaged, style: "cloud", appearance: "dark" }),
    join(packagedRoot, "cloud-dark.png"),
  );

  // A build that lost the file answers null so the caller keeps its fallback.
  assert.equal(
    resolveAppIconPath({ ...api, style: "trail", appearance: "light", exists: () => false }),
    null,
  );
});

test("auto follows the app's mode and single-art styles keep one file", async () => {
  const shared = await import("@trail/shared");
  assert.deepEqual(shared.APP_ICON_APPEARANCES, ["light", "dark", "auto"]);
  assert.equal(shared.DEFAULT_APP_ICON_APPEARANCE, "auto");
  assert.equal(shared.resolveAppIconAppearance("auto", true), "dark");
  assert.equal(shared.resolveAppIconAppearance("auto", false), "light");
  assert.equal(shared.resolveAppIconAppearance("light", true), "light");
  assert.equal(shared.resolveAppIconAppearance("dark", false), "dark");
  assert.equal(shared.supportsAppIconAppearance("cloud"), true);
  assert.equal(shared.supportsAppIconAppearance("trail"), true);
  assert.equal(shared.appIconFileName("cloud", "dark"), "cloud-dark.png");
  assert.equal(shared.appIconFileName("cloud", "light"), "cloud.png");
  assert.equal(shared.appIconFileName("mascot", "dark"), "mascot-dark.png");
  assert.equal(shared.appIconFileName("trail", "light"), "trail.png");
});

test("all bundled icon styles exist for the window and the preview", () => {
  for (const root of ["../build/app-icons", "../src/assets/app-icons"]) {
    for (const file of [
      "trail.png",
      "trail-dark.png",
      "mascot.png",
      "mascot-dark.png",
      "cloud.png",
      "cloud-dark.png",
    ]) {
      assert.ok(existsSync(new URL(`${root}/${file}`, import.meta.url)), `${root}/${file}`);
    }
  }
  // Packaged builds read resources/app-icons, so the folder must ship.
  assert.match(packageJson, /"from": "build\/app-icons",\s*"to": "app-icons"/);
});

test("the main process exposes read/write channels and wires the icon", () => {
  assert.match(protocol, /appIconGet: "pi-desktop\/appIcon\/get"/);
  assert.match(protocol, /appIconSet: "pi-desktop\/appIcon\/set"/);
  assert.match(protocol, /appIconAppearanceSet: "pi-desktop\/appIcon\/appearanceSet"/);
  assert.match(settingsIpc, /handle\(IPC\.invoke\.appIconGet,/);
  assert.match(settingsIpc, /handle\(IPC\.invoke\.appIconSet,/);
  assert.match(settingsIpc, /handle\(IPC\.invoke\.appIconAppearanceSet,/);

  // Windows/Linux windows take the stored style and resolved appearance at creation.
  assert.match(windowSource, /const appIconRecord = readAppIcon\(dataDir\)/);
  assert.match(
    windowSource,
    /icon: windowsIconPath\(isDevelopmentBuild, appIconRecord\.style, appIconAppearance\)/,
  );
  assert.match(windowSource, /resolveAppIconPath\(\{/);

  // macOS Dock tiles follow the same record, development and packaged alike.
  assert.match(lifecycle, /app\.dock\.setIcon\(icon\)/);
  assert.match(lifecycle, /resolveAppIconAppearance\(record\.appearance/);
});

test("choosing a style or appearance repaints the live window, taskbar and dock", () => {
  assert.match(
    settingsIpc,
    /const next = setAppIcon\(dataDir, style\);\s*applyAppIconRuntime\(next\.style, next\.appearance\);/,
  );
  assert.match(
    settingsIpc,
    /const next = setAppIconAppearance\(dataDir, appearance\);\s*applyAppIconRuntime\(next\.style, next\.appearance\);/,
  );
  assert.match(
    registerSource,
    /applyAppIconRuntime: \(style, appearance\) => \{\s*const result = applyWindowIcon\(\{\s*style,\s*appearance,\s*isDevelopmentBuild,?\s*\}\)/,
  );
  assert.match(runtimeSource, /nativeTheme\.shouldUseDarkColors/);
  // Windows/Linux repaint every open window; macOS repaints the dock.
  assert.match(runtimeSource, /for \(const window of BrowserWindow\.getAllWindows\(\)\)/);
  assert.match(runtimeSource, /window\.setIcon\(icon\)/);
  assert.match(runtimeSource, /app\.dock\.setIcon\(icon\)/);
});

test("the page and browser tab icon follow the same style and appearance", () => {
  const favicon = read("../src/lib/app-icon-favicon.ts");
  assert.match(favicon, /export function applyPageIcon\(style: AppIconStyle, appearance/);
  assert.match(favicon, /link\.rel = "icon"/);
  assert.match(favicon, /link\.href = href/);
  assert.match(favicon, /export async function syncPageIcon\(\): Promise<void>/);
  // Startup applies the stored style; nothing renders with the bundled one only.
  assert.match(entry, /void syncPageIcon\(\)/);
  assert.match(html, /<link rel="icon" type="image\/png" href="\/src\/assets\/app-icons\/trail\.png" \/>/);
  // The Settings row repaints the page icon after a successful write.
  assert.match(rows, /applyPageIcon\(next\.style, next\.appearance\)/);
});

test("the cloud mark animates wherever the renderer draws it", () => {
  const favicon = read("../src/lib/app-icon-favicon.ts");
  // Every renderer-drawn cloud mark moves: Settings tiles, the in-app brand mark
  // and the page icon all resolve through `appIconUrl`.
  // The icon surfaces take the plated copies: a fixed light/dark pick has to
  // stay legible on the opposite surface, which the bare home sprite cannot.
  assert.match(
    favicon,
    /import cloudMotionDarkUrl from\s*"\.\.\/assets\/app-icons\/cloud-motion-dark\.gif"/,
  );
  assert.match(
    favicon,
    /import cloudMotionLightUrl from\s*"\.\.\/assets\/app-icons\/cloud-motion-light\.gif"/,
  );
  assert.match(favicon, /export const APP_ICON_MOTION_URLS/);
  assert.match(favicon, /cloud: \{ light: cloudMotionLightUrl, dark: cloudMotionDarkUrl \}/);
  assert.match(favicon, /const motion = animated \? APP_ICON_MOTION_URLS\[style\]\?\.\[variant\]/);
  assert.match(favicon, /return motion \?\? APP_ICON_URLS\[style\]\[variant\]/);
  // A still request falls back to the PNG the window/taskbar icon shows.
  assert.match(favicon, /isDark: boolean = isPageDark\(\),\s*animated = /);
  // The page icon declares what it points at instead of always claiming PNG.
  assert.match(favicon, /export function appIconMimeType\(url: string\)/);
  assert.match(favicon, /return url\.toLowerCase\(\)\.endsWith\("\.gif"\) \? "image\/gif" : "image\/png"/);
  assert.match(favicon, /link\.type = appIconMimeType\(href\)/);

  for (const file of [
    "home-mascot-light.gif",
    "home-mascot-dark.gif",
    "app-icons/cloud-motion-light.gif",
    "app-icons/cloud-motion-dark.gif",
  ]) {
    const url = new URL(`../src/assets/${file}`, import.meta.url);
    assert.ok(existsSync(url), `../src/assets/${file}`);
    assert.ok(readFileSync(url).length > 0, `../src/assets/${file}`);
  }
  // The static PNGs stay bundled: the native window/taskbar/dock icon takes one
  // bitmap, so the OS surfaces keep the still cloud artwork.
  for (const file of ["cloud.png", "cloud-dark.png"]) {
    assert.ok(existsSync(new URL(`../src/assets/app-icons/${file}`, import.meta.url)), file);
  }
});

test("the Settings row offers every style and writes through the API", () => {
  assert.match(rows, /APP_ICON_STYLES\.map/);
  assert.match(rows, /api\s*\n?\s*\.?getAppIcon\(\)/);
  assert.match(rows, /api\.setAppIcon\(style\)/);
  assert.match(rows, /settings\.appIconStyleHint/);
  assert.match(settingsPage, /<AppIconRows \/>/);
  // Each tile is one surface: the icon is judged as a single mark, not split.
  assert.match(styles, /\.app-icon-preview\s*\{[\s\S]*?background: var\(--ds-tile-deep\)/);
  assert.doesNotMatch(styles, /\.app-icon-preview-(light|dark)\s*\{/);
});

test("the Settings row exposes light/dark/auto and hands them to the main process", () => {
  assert.match(rows, /APP_ICON_APPEARANCES\.map/);
  assert.match(rows, /api\.setAppIconAppearance\(appearance\)/);
  assert.match(rows, /supportsAppIconAppearance\(selected\)/);
  assert.match(rows, /settings\.appIconAppearance\b/);
  // One row: the appearance picker is a compact drop-down on the head line, so
  // the tiles remain the only visual subject of the card.
  assert.match(rows, /<SettingsMenuSelect/);
  assert.doesNotMatch(rows, /<SegmentedControl/);
  assert.match(styles, /\.app-icon-heading\s*\{/);
  assert.match(styles, /\.app-icon-appearance\s*\{/);
});

test("the in-app brand mark follows the stored icon instead of the shipped logo", () => {
  // One record, one renderer store: the sidebar mark and the startup logo read
  // the same style the window/taskbar/tab use, so a pick cannot leave the
  // in-app mark on the old artwork.
  assert.match(iconStore, /export function setAppIconState/);
  assert.match(iconStore, /export function useAppIconState/);
  assert.match(brandLogo, /useAppIconState\(\)/);
  assert.match(brandLogo, /appIconUrl\(icon\.style, icon\.appearance, dark\)/);
  // A missing record still paints the bundled brand mark.
  assert.match(brandLogo, /import brandLogoUrlLight from "\.\.\/assets\/brand\/logo-light\.png"/);
  assert.match(brandLogo, /import brandLogoUrlDark from "\.\.\/assets\/brand\/logo-dark\.png"/);
  // The record reaches the store from both the startup read and the row.
  assert.match(read("../src/lib/app-icon-favicon.ts"), /setAppIconState\(state\)/);
  assert.match(rows, /setAppIconState\(next\)/);
});

test("the Settings row spells out which icon is in use", () => {
  assert.match(rows, /settings\.appIconCurrent/);
  assert.match(rows, /style: t\(ICON_LABEL_KEYS\[selected\]\)/);
  assert.match(rows, /appearance: t\(APPEARANCE_LABEL_KEYS\[appearance\]\)/);
  assert.match(styles, /\.app-icon-current\s*\{/);
});

test("every locale names the row, every style, every appearance and the effect of a change", () => {
  for (const catalog of catalogs) {
    for (const key of [
      "appIcon",
      "appIconStyle",
      "appIconStyleDesc",
      "appIconStyleHint",
      "appIconTrail",
      "appIconMascot",
      "appIconCloud",
      "appIconSaved",
      "appIconSaveError",
      "appIconAppearance",
      "appIconAppearanceLight",
      "appIconAppearanceDark",
      "appIconAppearanceAuto",
      "appIconAppearanceDisabled",
      "appIconAppearanceHint",
      "appIconAppearanceSaved",
      "appIconCurrent",
    ]) {
      assert.match(catalog, new RegExp(`\\b${key}\\b`), key);
    }
  }
});
