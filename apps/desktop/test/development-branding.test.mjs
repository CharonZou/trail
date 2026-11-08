import { readMainSource, readMainModule } from "./helpers/source-contracts.mjs";
import { decodeRgbaPng } from "./helpers/png-pixels.mjs";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const devScriptUrl = new URL(
  "../../../scripts/dev-electron.mjs",
  import.meta.url,
);

const mainSource = await readMainSource();
const installationSource = await readMainModule("installation.ts");
const brandingSource = await readMainModule("bootstrap/app-lifecycle.ts");
const windowSource = await readMainModule("bootstrap/window.ts");
const startupSource = await readMainModule("bootstrap/startup.ts");
const iconScriptSource = await readFile(
  new URL("../../../scripts/make-icon.py", import.meta.url),
  "utf8",
);
const devScriptSource = await readFile(
  devScriptUrl,
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const protocolSource = await readFile(
  new URL("../../../packages/shared/src/protocol.ts", import.meta.url),
  "utf8",
);
const windowsIcon = await readFile(
  new URL("../build/icon.ico", import.meta.url),
);
const logoDark = decodeRgbaPng(
  await readFile(new URL("../build/logo_dark.png", import.meta.url)),
);
const trayTemplate = decodeRgbaPng(
  await readFile(new URL("../build/tray-icon-mac.png", import.meta.url)),
);

test("Windows runtime registers the canonical native application identity", () => {
  const appId = protocolSource.match(/APP_ID = "([^"]+)"/)?.[1];
  assert.equal(appId, packageJson.build.appId);
  assert.ok(startupSource.includes("app.whenReady()"), "main process readiness hook");
  assert.match(installationSource, /app\.setName\(APP_NAME\)/);
  assert.match(
    installationSource,
    /process\.platform === "win32"[\s\S]*app\.setAppUserModelId\(APP_ID\)/,
  );
});

test("Windows packages pin Trail executable and shortcut names", () => {
  assert.equal(packageJson.build.win.executableName, "Trail");
  assert.equal(packageJson.build.nsis.shortcutName, "Trail");
});

test("Windows packages and windows use the canonical Trail icon", () => {
  assert.equal(packageJson.build.win.icon, "build/icon.ico");
  assert.deepEqual(
    packageJson.build.win.extraResources.find((resource) => resource.to === "app-icon.ico"),
    {
      from: "build/icon.ico",
      to: "app-icon.ico",
    },
  );
  assert.deepEqual([...windowsIcon.subarray(0, 4)], [0, 0, 1, 0]);
  assert.ok(windowsIcon.readUInt16LE(4) >= 4, "ICO must contain multiple sizes");
  assert.match(iconScriptSource, /windows_icon = BUILD \/ "icon\.ico"/);
  assert.match(iconScriptSource, /format="ICO"/);
  assert.match(windowSource, /function windowsIconPath\(isDevelopmentBuild: boolean\)/);
  // Build mode decides the asset root: a development launch that reports
  // `app.isPackaged === true` (ELECTRON_FORCE_IS_PACKAGED) must still resolve
  // the checkout's `build/icon.ico`, not `process.resourcesPath`.
  assert.match(windowSource, /resolveWindowIconPath\(/);
  assert.doesNotMatch(
    windowSource,
    /app\.isPackaged\s*\n?\s*\?\s*process\.resourcesPath/,
  );
  assert.match(windowSource, /icon: windowsIconPath\(isDevelopmentBuild\)/);
});

/** The alpha split of a decoded image: the brand mark is flat, so only
 *  anti-aliased edges may sit between fully opaque and fully transparent. */
function alphaProfile({ width, height, pixels }) {
  let solid = 0;
  let speckled = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] === 255) solid += 1;
    else if (pixels[index] !== 0) speckled += 1;
  }
  return { solid, speckled, area: width * height };
}

function alphaAt({ width, pixels }, x, y) {
  return pixels[(y * width + x) * 4 + 3];
}

/** Smallest box that contains every non-transparent pixel. */
function inkBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** The images an ICO carries, with each entry's payload. */
function icoEntries(buf) {
  const entries = [];
  for (let index = 0; index < buf.readUInt16LE(4); index += 1) {
    const entry = 6 + index * 16;
    const offset = buf.readUInt32LE(entry + 12);
    entries.push({
      width: buf[entry] || 256,
      height: buf[entry + 1] || 256,
      payload: buf.subarray(offset, offset + buf.readUInt32LE(entry + 8)),
    });
  }
  return entries;
}

test("the Windows icon paints the flat brand mark, not a speckled plate", () => {
  // The taskbar and Alt+Tab ask for the mark at 24px, where artwork that was
  // dithered into semi-transparent noise reads as grey mush: the icon this
  // build shipped once carried 43% partial-alpha pixels and 8% solid ones.
  // The brand mark is flat, so only the rounded corners anti-alias.
  const entries = icoEntries(windowsIcon);
  assert.deepEqual(
    entries.map((entry) => entry.width).sort((a, b) => a - b),
    [16, 24, 32, 48, 64, 128, 256],
  );

  for (const entry of entries) {
    const image = decodeRgbaPng(entry.payload);
    assert.deepEqual([image.width, image.height], [entry.width, entry.height]);
    const { solid, speckled, area } = alphaProfile(image);
    assert.ok(solid * 2 > area, `${image.width}px: only ${solid} solid pixels`);
    assert.ok(
      speckled * 4 < area,
      `${image.width}px: ${speckled} partial-alpha pixels`,
    );
  }

  // The mark is a rounded square, so the corner falls outside the plate.
  const tile = decodeRgbaPng(
    entries.find((entry) => entry.width === 32).payload,
  );
  assert.equal(alphaAt(tile, 0, 0), 0, "corner outside the rounded plate");
  assert.equal(alphaAt(tile, 16, 16), 255, "plate");
});

test("the documentation logo paints the same flat mark as the icons", () => {
  const { solid, speckled, area } = alphaProfile(logoDark);
  assert.deepEqual([logoDark.width, logoDark.height], [1254, 1254]);
  assert.ok(solid * 2 > area, `only ${solid} solid pixels`);
  assert.ok(speckled * 4 < area, `${speckled} partial-alpha pixels`);
  assert.equal(alphaAt(logoDark, 0, 0), 0, "corner outside the rounded plate");
  assert.equal(alphaAt(logoDark, 627, 627), 255, "plate");
});

test("the macOS tray template carries the bar glyph, never the app plate", () => {
  // A template image is tinted by the system wherever it is opaque, so the
  // black plate must not survive into this asset: it would paint a solid
  // rounded square in the menu bar. Only the bars may be opaque.
  assert.deepEqual([trayTemplate.width, trayTemplate.height], [1024, 1024]);
  for (const [x, y] of [
    [0, 0],
    [1023, 0],
    [0, 1023],
    [1023, 1023],
    [60, 60],
    [512, 512],
    [240, 700],
  ]) {
    assert.equal(alphaAt(trayTemplate, x, y), 0, `plate stays clear at ${x},${y}`);
  }
  // The bars themselves, at the tallest and the shortest column.
  assert.equal(alphaAt(trayTemplate, 815, 200), 255, "tallest bar");
  assert.equal(alphaAt(trayTemplate, 150, 700), 255, "shortest bar");

  // The glyph is normalised to three quarters of the tile so it keeps the same
  // menu bar weight the app icon has, and stays centred.
  const bounds = inkBounds(trayTemplate);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  assert.ok(Math.abs(width - 768) <= 2, `glyph is ${width}px wide`);
  assert.ok(Math.abs(height - 678) <= 2, `glyph is ${height}px tall`);
  assert.ok(Math.abs(bounds.minX - (1024 - width) / 2) <= 2, "centred");
  assert.ok(Math.abs(bounds.minY - (1024 - height) / 2) <= 2, "centred");
});

test("Linux packages align the desktop entry with the Wayland app identity", () => {
  assert.equal(packageJson.desktopName, "trail.desktop");
  assert.equal(packageJson.build.linux.syncDesktopName, true);
});

test("macOS development uses the canonical Trail Dock icon", () => {
  assert.match(
    brandingSource,
    /process\.platform !== "darwin" \|\| !isDevelopmentBuild \|\| !app\.dock/,
  );
  assert.match(
    brandingSource,
    /join\(app\.getAppPath\(\), "build", "icon_1024\.png"\)/,
  );
  assert.match(brandingSource, /nativeImage\.createFromPath\(iconPath\)/);
  assert.match(brandingSource, /if \(icon\.isEmpty\(\)\)/);
  assert.match(brandingSource, /app\.dock\.setIcon\(icon\)/);
  // Branding is the first thing readiness does, after the only statement that
  // may precede it: the bail for a launch that lost the single-instance lock
  // and must not touch the running app's Dock tile.
  assert.match(
    startupSource,
    /if \(!hasSingleInstanceLock\) return;\s+applyDevelopmentBranding\(\);/,
  );
});

test("macOS icon derivation preserves the canonical renderer asset", () => {
  assert.match(iconScriptSource, /SOURCE = BUILD \/ "icon_1024\.png"/);
  assert.match(iconScriptSource, /with Image\.open\(SOURCE\) as source/);
  assert.doesNotMatch(
    iconScriptSource,
    /\.save\(BUILD \/ "icon_1024\.png"\)/,
  );
  // The documented pipeline is the only producer of the derived assets, and the
  // tray template follows the current mark: the bars, not a hand-drawn clip
  // around the retired PI artwork.
  assert.match(iconScriptSource, /logo_dark = BUILD \/ "logo_dark\.png"/);
  assert.match(iconScriptSource, /does not contain the bar glyph/);
  assert.doesNotMatch(iconScriptSource, /mark_clip|ImageDraw/);
});

test("development launcher resolves Electron before platform-specific setup", () => {
  assert.match(
    devScriptSource,
    /const electron = resolveElectronInstallation\(\);\s+if \(process\.platform === "darwin"\)/,
  );
});

test("macOS development launches from a branded host bundle", () => {
  assert.equal(packageJson.scripts.dev, "node ../../scripts/dev-electron.mjs");
  assert.match(devScriptSource, /process\.platform === "darwin"/);
  assert.match(devScriptSource, /TRAIL_DEV: "1"/);
  assert.match(devScriptSource, /ELECTRON_EXEC_PATH/);
  assert.match(devScriptSource, /CFBundleDisplayName", APP_NAME/);
  assert.match(devScriptSource, /CFBundleName", APP_NAME/);
  assert.match(devScriptSource, /CFBundleExecutable", APP_NAME/);
  assert.match(devScriptSource, /CFBundleIconFile", "icon\.icns"/);
  assert.match(devScriptSource, /BRANDING_SCHEMA = "v4"/);
  assert.match(
    devScriptSource,
    /copyFileSync\(iconPath, join\(resources, "icon\.icns"\)\)/,
  );
  assert.match(
    devScriptSource,
    /copyFileSync\(trayIconPath, join\(resources, "tray-icon\.png"\)\)/,
  );
  assert.match(
    devScriptSource,
    /copyFileSync\(trayIconMacPath, join\(resources, "tray-icon-mac\.png"\)\)/,
  );
  assert.match(devScriptSource, /verbatimSymlinks: true/);
  assert.match(devScriptSource, /join\(ROOT, "\.cache", "electron-dev"\)/);
  assert.doesNotMatch(devScriptSource, /node_modules.*Info\.plist/);
});

test("Electron main resolves runtime paths from ES module URLs", () => {
  assert.match(mainSource, /function getModuleDirectory\(moduleUrl: string\)/);
  assert.doesNotMatch(mainSource, /\b__dirname\b/);
});

test(
  "development launcher can be imported without starting Electron",
  async () => {
    const launcher = await import(devScriptUrl.href);
    assert.equal(typeof launcher.prepareMacDevelopmentBundle, "function");
  },
);

test(
  "macOS development bundle rewrites native identity and reuses its cache",
  { skip: process.platform !== "darwin" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "trail-dev-bundle-"));
    const sourceBundle = join(root, "Electron.app");
    const contents = join(sourceBundle, "Contents");
    const macos = join(contents, "MacOS");
    const resources = join(contents, "Resources");
    const executable = join(macos, "Electron");
    const iconPath = join(root, "source.icns");
    const trayIconPath = join(root, "tray-icon.png");
    const trayIconMacPath = join(root, "tray-icon-mac.png");
    const cacheRoot = join(root, "cache");

    try {
      await mkdir(macos, { recursive: true });
      await mkdir(resources, { recursive: true });
      await writeFile(executable, "electron-host");
      await writeFile(iconPath, "canonical-icon");
      await writeFile(trayIconPath, "generic-tray-icon");
      await writeFile(trayIconMacPath, "macOS-tray-icon");
      await writeFile(
        join(contents, "Info.plist"),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Electron</string>
<key>CFBundleName</key><string>Electron</string>
<key>CFBundleExecutable</key><string>Electron</string>
<key>CFBundleIdentifier</key><string>com.github.Electron</string>
<key>CFBundleIconFile</key><string>electron.icns</string>
</dict></plist>`,
      );

      const { prepareMacDevelopmentBundle } = await import(devScriptUrl.href);
      const options = {
        electronExecutable: executable,
        electronVersion: "test-version",
        iconPath,
        trayIconPath,
        trayIconMacPath,
        cacheRoot,
        sign: false,
      };
      const brandedExecutable = prepareMacDevelopmentBundle(options);
      const brandedContents = join(
        brandedExecutable,
        "..",
        "..",
      );
      const plist = await readFile(join(brandedContents, "Info.plist"), "utf8");

      assert.equal(await readFile(brandedExecutable, "utf8"), "electron-host");
      assert.equal(
        await readFile(join(brandedContents, "Resources", "icon.icns"), "utf8"),
        "canonical-icon",
      );
      assert.equal(
        await readFile(join(brandedContents, "Resources", "tray-icon.png"), "utf8"),
        "generic-tray-icon",
      );
      assert.equal(
        await readFile(
          join(brandedContents, "Resources", "tray-icon-mac.png"),
          "utf8",
        ),
        "macOS-tray-icon",
      );
      assert.match(plist, /<string>Trail<\/string>/);
      assert.match(plist, /<string>net\.aiuo\.pi-desktop\.dev<\/string>/);
      assert.equal(prepareMacDevelopmentBundle(options), brandedExecutable);

      await writeFile(trayIconMacPath, "updated-macOS-tray-icon");
      const updatedExecutable = prepareMacDevelopmentBundle(options);
      assert.notEqual(updatedExecutable, brandedExecutable);
      const updatedContents = join(updatedExecutable, "..", "..");
      assert.equal(
        await readFile(
          join(updatedContents, "Resources", "tray-icon-mac.png"),
          "utf8",
        ),
        "updated-macOS-tray-icon",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
