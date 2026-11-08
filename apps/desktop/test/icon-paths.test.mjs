import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  resolveTrayIconPath,
  resolveWindowIconPath,
} from "../electron/main/bootstrap/icon-paths.ts";

const appPath = join("checkout", "apps", "desktop");
const resourcesPath = join("installed", "resources");
const buildPath = join(appPath, "build");

const everything = () => true;
const nothing = () => false;

function lookup(overrides = {}) {
  return {
    isDevelopmentBuild: false,
    platform: "win32",
    appPath,
    resourcesPath,
    exists: everything,
    ...overrides,
  };
}

/** Matches only assets that exist under `build/`, as a development checkout
 *  does while `process.resourcesPath` holds just `default_app.asar`. */
function onlyBuild(path) {
  return path.startsWith(buildPath);
}

test("development builds resolve the Windows icon from the checkout", () => {
  assert.equal(
    resolveWindowIconPath(
      lookup({ isDevelopmentBuild: true, exists: onlyBuild }),
    ),
    join(buildPath, "icon.ico"),
  );
  assert.equal(
    resolveTrayIconPath(
      lookup({ isDevelopmentBuild: true, exists: onlyBuild }),
    ),
    join(buildPath, "icon.png"),
  );
});

test("packaged builds resolve the Windows icon from resourcesPath", () => {
  assert.equal(
    resolveWindowIconPath(
      lookup({ isDevelopmentBuild: false, exists: (path) => !onlyBuild(path) }),
    ),
    join(resourcesPath, "app-icon.ico"),
  );
  assert.equal(
    resolveTrayIconPath(
      lookup({ isDevelopmentBuild: false, exists: (path) => !onlyBuild(path) }),
    ),
    join(resourcesPath, "tray-icon.png"),
  );
});

test("TRAIL_DEV=1 with app.isPackaged=true keeps the development icons", () => {
  // installation.ts derives isDevelopmentBuild as
  // `TRAIL_DEV === "1" || !app.isPackaged`, so this environment — a dev launch
  // whose runtime was told ELECTRON_FORCE_IS_PACKAGED — still resolves the
  // checkout assets even though process.resourcesPath is populated.
  const faulted = lookup({ isDevelopmentBuild: true, exists: onlyBuild });
  assert.equal(resolveWindowIconPath(faulted), join(buildPath, "icon.ico"));
  assert.equal(resolveTrayIconPath(faulted), join(buildPath, "icon.png"));
});

test("missing assets resolve to null instead of a stale path", () => {
  assert.equal(
    resolveWindowIconPath(lookup({ isDevelopmentBuild: true, exists: nothing })),
    null,
  );
  assert.equal(
    resolveWindowIconPath(lookup({ isDevelopmentBuild: false, exists: nothing })),
    null,
  );
  assert.equal(
    resolveTrayIconPath(lookup({ isDevelopmentBuild: true, exists: nothing })),
    null,
  );
});

test("non-Windows windows never take a BrowserWindow icon", () => {
  for (const platform of ["darwin", "linux"]) {
    assert.equal(resolveWindowIconPath(lookup({ platform })), null);
  }
});

test("Linux tray follows build mode", () => {
  assert.equal(
    resolveTrayIconPath(lookup({ platform: "linux", isDevelopmentBuild: true })),
    join(buildPath, "icon.png"),
  );
  assert.equal(
    resolveTrayIconPath(lookup({ platform: "linux", isDevelopmentBuild: false })),
    join(resourcesPath, "tray-icon.png"),
  );
});

test("macOS tray prefers the template glyph and then the generic asset", () => {
  assert.equal(
    resolveTrayIconPath(
      lookup({ platform: "darwin", isDevelopmentBuild: true }),
    ),
    join(buildPath, "tray-icon-mac.png"),
  );
  assert.equal(
    resolveTrayIconPath(
      lookup({
        platform: "darwin",
        isDevelopmentBuild: true,
        exists: (path) => path === join(buildPath, "icon.png"),
      }),
    ),
    join(buildPath, "icon.png"),
  );
  assert.equal(
    resolveTrayIconPath(
      lookup({
        platform: "darwin",
        isDevelopmentBuild: false,
        exists: (path) => path === join(resourcesPath, "tray-icon.png"),
      }),
    ),
    join(resourcesPath, "tray-icon.png"),
  );
});
