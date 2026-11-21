/**
 * Startup appearance (Settings ▸ General ▸ Appearance): logo visibility and
 * the progress-area animation.
 *
 * Two layers are covered: the main-process record must be usable before the
 * host starts (that is why it is not part of AppSettings), and the Settings
 * rows + boot splash contracts that consume it.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readAppSource } from "./helpers/source-contracts.mjs";
import { loadStyles } from "./helpers/styles.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [protocol, settingsIpc, record, rows, settingsPage, splash, styles, english, chinese] =
  await Promise.all([
    read("../../../packages/shared/src/protocol.ts"),
    read("../electron/main/ipc/settings-ipc.ts"),
    read("../electron/main/startup-appearance.ts"),
    read("../src/components/settings/StartupAppearanceRows.tsx"),
    read("../src/features/settings/SettingsPage.tsx"),
    read("../src/components/StartupSplash.tsx"),
    loadStyles(),
    read("../../../packages/i18n/src/locales/en/index.ts"),
    read("../../../packages/i18n/src/locales/zh-CN/index.ts"),
  ]);

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "trail-startup-appearance-"));
  await run(dir);
  // The temp directory is intentionally left to the OS: a failed assertion
  // should keep its files for inspection.
}

test("startup appearance falls back to the shipped surface when absent", async () => {
  const { readStartupAppearance } = await import("../electron/main/startup-appearance.ts");
  await withTempDir(async (dir) => {
    assert.deepEqual(readStartupAppearance(dir), {
      mode: "default",
      showLogo: true,
      fileName: null,
      displayName: null,
      dataUrl: null,
    });
  });
});

test("importing an animation keeps the logo switch intact", async () => {
  const { importStartupAnimation, readStartupAppearance, setStartupAppearance } = await import(
    "../electron/main/startup-appearance.ts"
  );
  await withTempDir(async (dir) => {
    setStartupAppearance(dir, { showLogo: false });
    const source = join(dir, "bloody-critical-progress.svg");
    await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', "utf8");
    const imported = importStartupAnimation(dir, source);
    assert.equal(imported.canceled, false);
    assert.equal(imported.mode, "custom");
    assert.equal(imported.showLogo, false);
    assert.equal(imported.fileName, "animation.svg");
    assert.equal(imported.displayName, "bloody-critical-progress.svg");
    assert.match(imported.dataUrl, /^data:image\/svg\+xml;base64,/);
    assert.ok(existsSync(join(dir, "startup-appearance", "animation.svg")));

    const persisted = readStartupAppearance(dir);
    assert.equal(persisted.mode, "custom");
    assert.equal(persisted.showLogo, false);
  });
});

test("the two switches are independent and validated", async () => {  const { readStartupAppearance, setStartupAppearance } = await import(
    "../electron/main/startup-appearance.ts"
  );
  await withTempDir(async (dir) => {
    // Hiding the logo does not change which animation plays.
    assert.equal(setStartupAppearance(dir, { showLogo: false }).mode, "default");
    assert.equal(setStartupAppearance(dir, { showLogo: true }).showLogo, true);
    // Switching the animation does not change logo visibility.
    setStartupAppearance(dir, { showLogo: false, mode: "custom" });
    assert.equal(setStartupAppearance(dir, { mode: "default" }).showLogo, false);
    assert.deepEqual(readStartupAppearance(dir), {
      mode: "default",
      showLogo: false,
      fileName: null,
      displayName: null,
      dataUrl: null,
    });
    assert.throws(() => setStartupAppearance(dir, { mode: "video" }), /mode is invalid/);
    assert.throws(() => setStartupAppearance(dir, { showLogo: "yes" }), /showLogo is invalid/);
  });
});

test("the second built-in preset is the bundled critical bar", async () => {
  const { readStartupAppearance, setStartupAppearance } = await import(
    "../electron/main/startup-appearance.ts"
  );
  await withTempDir(async (dir) => {
    assert.equal(setStartupAppearance(dir, { mode: "critical" }).mode, "critical");
    // Persisted as its own mode, and no imported file is required for it.
    assert.equal(readStartupAppearance(dir).mode, "critical");
    assert.equal(readStartupAppearance(dir).dataUrl, null);
    // Switching away and back keeps it.
    setStartupAppearance(dir, { mode: "default" });
    assert.equal(setStartupAppearance(dir, { mode: "critical" }).mode, "critical");
  });

  const assetUrl = new URL("../src/assets/startup/critical-bar.svg", import.meta.url);
  assert.ok(existsSync(assetUrl), "the preset asset must ship with the renderer");
  assert.match(rows, /from "\.\.\/\.\.\/assets\/startup\/critical-bar\.svg"/);
  assert.match(splash, /from "\.\.\/assets\/startup\/critical-bar\.svg"/);
  assert.match(splash, /appearance\?\.mode === "critical"[\s\S]*?criticalBarUrl/);
  assert.match(rows, /aria-label=\{t\("settings\.startupAnimationCritical"\)\}/);
});

test("unsupported formats and oversized files are rejected before writing", async () => {
  const { importStartupAnimation, readStartupAppearance } = await import(
    "../electron/main/startup-appearance.ts"
  );
  await withTempDir(async (dir) => {
    const text = join(dir, "notes.txt");
    await writeFile(text, "not an animation", "utf8");
    assert.throws(() => importStartupAnimation(dir, text), /unsupported/);
    assert.equal(readStartupAppearance(dir).mode, "default");
    assert.equal(existsSync(join(dir, "startup-appearance")), false);

    const huge = join(dir, "huge.gif");
    await writeFile(huge, Buffer.alloc(9 * 1024 * 1024));
    assert.throws(() => importStartupAnimation(dir, huge), /too large/);
  });
});

test("the record is main-owned so the splash can read it before the host boots", () => {
  assert.match(protocol, /startupAppearanceGet: "pi-desktop\/startupAppearance\/get"/);
  assert.match(protocol, /startupAppearanceSet: "pi-desktop\/startupAppearance\/set"/);
  assert.match(record, /CONFIG_FILE = "startup-appearance\.json"/);
  assert.match(record, /FOLDER = "startup-appearance"/);
  assert.doesNotMatch(record, /host\.call/);
  assert.match(settingsIpc, /IPC\.invoke\.startupAppearanceGet/);
  assert.match(settingsIpc, /IPC\.invoke\.startupAppearancePick/);
  assert.match(settingsIpc, /STARTUP_ANIMATION_DIALOG_EXTENSIONS/);
  assert.match(settingsIpc, /dialog\.showOpenDialog/);
});

test("the appearance card is one surface: animation cards plus a logo switch", () => {
  assert.match(settingsPage, /import \{ StartupAppearanceRows \}/);
  assert.match(settingsPage, /<StartupAppearanceRows \/>/);
  // One row only: the switch shares the head line with the animation title.
  assert.equal((rows.match(/className="settings-row /g) ?? []).length, 1);
  assert.match(rows, /className="settings-row settings-row-stacked"/);
  assert.doesNotMatch(rows, /<SettingsRow/);
  assert.match(rows, /className="startup-animation-heading"/);
  assert.match(rows, /className="startup-logo-switch"/);
  const heading = rows.indexOf('className="startup-animation-heading"');
  const toggle = rows.indexOf("<SettingsToggle");
  assert.ok(heading >= 0 && toggle > heading, "the logo switch belongs to the head line");
  assert.match(rows, /<SettingsToggle[\s\S]*?checked=\{logoShown\}/);
  assert.match(rows, /write\(\{ showLogo: !logoShown \}\)/);
  // Animation: three preview cards, never a logo preview.
  assert.match(rows, /role="radiogroup"/);
  assert.equal((rows.match(/role="radio"/g) ?? []).length, 3);
  assert.match(rows, /aria-checked=\{mode === "default"\}/);
  assert.match(rows, /aria-checked=\{mode === "critical"\}/);
  assert.match(rows, /aria-checked=\{mode === "custom"\}/);
  assert.match(rows, /startup-animation-preview-bar/);
  assert.doesNotMatch(rows, /BrandLogo/);
  assert.doesNotMatch(rows, /SegmentedControl/);
  assert.match(rows, /api\.pickStartupAnimation\(\)/);
  assert.match(rows, /api\.setStartupAppearance\(/);
  assert.match(styles, /\.startup-animation-option\s*\{/);
  assert.match(styles, /\.startup-animation-preview-track\s*\{/);
  assert.match(styles, /\.startup-logo-switch\s*\{/);
});

test("the boot splash honours the logo switch and plays the custom animation", () => {
  assert.match(splash, /api\s*\.getStartupAppearance\(\)/);
  assert.match(splash, /const logoShown = appearance\?\.showLogo !== false/);
  assert.match(splash, /logoShown \?/);
  assert.match(
    splash,
    /appearance\?\.mode === "custom"[\s\S]{0,40}appearance\.dataUrl/,
  );
  assert.match(splash, /className="startup-splash-animation"/);
  assert.match(splash, /className="startup-splash-track"/);
  assert.match(splash, /<BrandLogo size=\{64\}/);
  assert.match(styles, /\.startup-splash-stage\s*\{/);
  assert.match(styles, /\.startup-splash-animation\s*\{/);
});

test("startup appearance copy is catalog-backed in English and Chinese", () => {
  assert.match(english, /startupLogo: "Show startup logo"/);
  assert.match(chinese, /startupLogo: "开机 Logo 显示"/);
  assert.match(chinese, /startupAnimation: "进度条动画"/);
  assert.match(chinese, /startupAnimationDefault: "默认进度条"/);
});
