import assert from "node:assert/strict";
import { basename, dirname, join, resolve } from "node:path";
import { register } from "node:module";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readMainModule } from "./helpers/source-contracts.mjs";

const here = dirname(fileURLToPath(import.meta.url));

register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));
const {
  applyDevelopmentUserData,
  applyPackagedUserData,
  DEVELOPMENT_DATA_DIR_NAME,
  DEVELOPMENT_INSTALLATION_NAME,
  INSTALLATION_DATA_DIR_NAME,
  resolveDataDir,
} = await import("../electron/main/data-paths.ts");

const indexSource = await readMainModule("index.ts");
const installationSource = await readMainModule("installation.ts");
const entrySource = await readMainModule("entry.ts");

test("a development build owns a different data directory than the shipped app", () => {
  const home = join(tmpdir(), "trail-profile-home");

  assert.equal(
    resolveDataDir({ override: undefined, development: false, home }),
    join(home, INSTALLATION_DATA_DIR_NAME),
  );
  assert.equal(
    resolveDataDir({ override: undefined, development: true, home }),
    join(home, DEVELOPMENT_DATA_DIR_NAME),
  );

  // A shipped installation must keep the directory its users already have, so
  // the split can only have moved the development side.
  assert.equal(INSTALLATION_DATA_DIR_NAME, ".trail");
  assert.equal(DEVELOPMENT_DATA_DIR_NAME, ".trail-dev");
  assert.equal(DEVELOPMENT_INSTALLATION_NAME, "Trail Dev");
});

test("TRAIL_DATA_DIR still overrides either profile", () => {
  const home = join(tmpdir(), "trail-profile-home");
  const override = join(tmpdir(), "trail-explicit-profile");

  for (const development of [false, true]) {
    assert.equal(
      resolveDataDir({ override, development, home }),
      override,
    );
  }

  // Every call site this replaced treated a blank value as unset, which is what
  // keeps `TRAIL_DATA_DIR=` from naming a relative directory.
  assert.equal(
    resolveDataDir({ override: "   ", development: true, home }),
    join(home, DEVELOPMENT_DATA_DIR_NAME),
  );
});

test("an upgraded installation stays on the profile it already has", () => {
  const home = join(tmpdir(), "trail-profile-home");
  const existsIn = (...names) => (path) => names.includes(basename(path));

  // A fresh installation gets the Trail names, and a half-migrated one prefers
  // them as soon as they exist.
  for (const [development, name] of [
    [false, ".trail"],
    [true, ".trail-dev"],
  ]) {
    assert.equal(
      resolveDataDir({ override: undefined, development, home, exists: existsIn() }),
      join(home, name),
    );
    assert.equal(
      resolveDataDir({
        override: undefined,
        development,
        home,
        exists: existsIn(name, name.replace("trail", "pi-desktop")),
      }),
      join(home, name),
    );
  }

  // The pre-Trail releases wrote `.pi-desktop` and `.pi-desktop-dev`, and each
  // profile falls back only to its own legacy directory: a development host
  // must never land on the packaged database.
  assert.equal(
    resolveDataDir({
      override: undefined,
      development: false,
      home,
      exists: existsIn(".pi-desktop"),
    }),
    join(home, ".pi-desktop"),
  );
  assert.equal(
    resolveDataDir({
      override: undefined,
      development: true,
      home,
      exists: existsIn(".pi-desktop"),
    }),
    join(home, ".trail-dev"),
  );
  assert.equal(
    resolveDataDir({
      override: undefined,
      development: true,
      home,
      exists: existsIn(".pi-desktop-dev"),
    }),
    join(home, ".pi-desktop-dev"),
  );

  // An explicit directory still wins over a legacy profile on disk.
  assert.equal(
    resolveDataDir({
      override: join(home, ".elsewhere"),
      development: false,
      home,
      exists: existsIn(".pi-desktop"),
    }),
    join(home, ".elsewhere"),
  );
});

test("userData keeps the packaged and development profiles separate", () => {
  const appData = join(tmpdir(), "trail-appdata");
  const existsIn = (...names) => (path) => names.includes(basename(path));
  const calls = [];
  const app = {
    commandLine: { hasSwitch: () => false },
    getPath: () => appData,
    setPath: (name, path) => calls.push([name, path]),
  };

  applyPackagedUserData(app, true, existsIn());
  applyDevelopmentUserData(app, true, existsIn());
  assert.deepEqual(calls, [
    ["userData", join(appData, "Trail")],
    ["userData", join(appData, "Trail Dev")],
  ]);

  calls.length = 0;
  applyPackagedUserData(app, true, existsIn("PI-Desktop"));
  applyDevelopmentUserData(app, true, existsIn("PI-Desktop Dev"));
  assert.deepEqual(calls, [
    ["userData", join(appData, "PI-Desktop")],
    ["userData", join(appData, "PI-Desktop Dev")],
  ]);

  calls.length = 0;
  applyPackagedUserData(app, false, existsIn("PI-Desktop"));
  applyDevelopmentUserData(app, false, existsIn("PI-Desktop Dev"));
  assert.equal(calls.length, 0, "only one profile is named per build kind");
});

test("the pre-Trail profile variable still reaches the lock verdict", () => {
  // `PI_DESKTOP_DATA_DIR` was published by scripts, terminals and managed
  // restarts before the rename. Normalizing it before the verdict keeps such a
  // profile opting out of the installation lock exactly as it always did.
  const normalize = installationSource.indexOf(
    "process.env.TRAIL_DATA_DIR = process.env.PI_DESKTOP_DATA_DIR;",
  );
  const lockVerdict = installationSource.indexOf(
    "const singleInstanceRequired = !process.env.TRAIL_DATA_DIR;",
  );
  assert.ok(normalize > 0, "main must accept the pre-Trail override name");
  assert.ok(normalize < lockVerdict);
  // The copy has to be conditional. Assigning an absent variable into
  // `process.env` stores the string "undefined", which the verdict below then
  // reads as a published profile — taking an ordinary launch off the lock and
  // resolving its data directory to `<cwd>/undefined`.
  assert.doesNotMatch(installationSource, /process\.env\.TRAIL_DATA_DIR\s*(\?\?=|\|\|=|&&=)/);
});

test("an explicit data directory reaches the child processes as an absolute path", () => {
  // host-core and the plugin host read the value as an environment variable
  // from a different working directory, so a relative override would resolve to
  // two different trees.
  const relative = join("trail-relative-profile");
  assert.equal(
    resolveDataDir({
      override: relative,
      development: false,
      home: join(tmpdir(), "trail-profile-home"),
    }),
    resolve(relative),
  );
});

test("applyDevelopmentUserData sets userData unless --user-data-dir is set", () => {
  const calls = [];
  const app = {
    commandLine: { hasSwitch: () => false },
    getPath: () => "/tmp/appData",
    setPath: (name, path) => calls.push([name, path]),
  };
  applyDevelopmentUserData(app, true);
  assert.deepEqual(calls, [
    ["userData", join("/tmp/appData", DEVELOPMENT_INSTALLATION_NAME)],
  ]);
  calls.length = 0;
  applyDevelopmentUserData(app, false);
  assert.equal(calls.length, 0);
  applyDevelopmentUserData(
    { ...app, commandLine: { hasSwitch: (name) => name === "user-data-dir" } },
    true,
  );
  assert.equal(calls.length, 0);
});

test("a development build takes its own userData before the single-instance lock", async () => {
  // The lock lives under `userData`, so the profile has to be applied before
  // Electron asks for it; otherwise a running packaged app refuses the lock and
  // `pnpm dev` quits on arrival.
  const pathsSource = await readMainModule("data-paths.ts");
  const apply = installationSource.indexOf("applyDevelopmentUserData(app, isDevelopmentBuild)");
  const setName = installationSource.indexOf("app.setName(APP_NAME)");
  const lock = installationSource.indexOf("app.requestSingleInstanceLock()");

  assert.ok(apply > 0, "main must give the development build its own userData");
  assert.ok(lock > 0, "main must request the single-instance lock");
  assert.ok(setName > 0 && setName < apply);
  assert.ok(apply < lock);

  // An explicit `--user-data-dir` wins. The E2E harnesses point a build at a
  // throwaway profile with that switch, so overriding it would run their
  // assertions against the developer's own state instead.
  assert.match(
    pathsSource,
    /if \(development && !app\.commandLine\.hasSwitch\("user-data-dir"\)\) \{/,
  );
  assert.match(
    pathsSource,
    /if \(packaged && !app\.commandLine\.hasSwitch\("user-data-dir"\)\) \{/,
  );
  // Both helpers name the profile from the same appData parent and the same
  // fallback verdict, so they cannot drift into pointing at different trees.
  assert.match(
    pathsSource,
    /app\.setPath\(\s*"userData",\s*join\(\s*appData,\s*pickProfileName\(/,
  );

  // The two profiles are told apart by the same verdict everywhere, and it is
  // reached before the name the lock path derives from.
  const development = installationSource.search(
    /const isDevelopmentBuild =\s*\n?\s*process\.env\.TRAIL_DEV === "1" \|\| !app\.isPackaged;/,
  );
  assert.ok(development > 0 && development < apply);
});

test("main resolves one data directory and publishes it to everything below", () => {
  assert.match(installationSource, /const defaultDataDir = desktopDataDir\(isDevelopmentBuild\);/);
  assert.match(entrySource, /prepareStorage\(defaultDataDir, !singleInstanceRequired\)/);
  assert.match(indexSource, /const storage = getStorageBootstrap\(\);/);
  assert.match(indexSource, /const dataDir = storage\.preferences\.roots\.data;/);
  // The plugin runtime resolves this root from the environment rather than
  // taking it as a parameter, so the resolved value has to be the one it reads.
  assert.match(indexSource, /process\.env\.TRAIL_DATA_DIR = dataDir;/);
  assert.doesNotMatch(indexSource, /join\(homedir\(\), "\.trail"\)/);

  // Publishing happens after the lock verdict, which reads the same variable:
  // moving the write above `singleInstanceRequired` would make every launch
  // look like it had been given an explicit data directory and skip the lock.
  const lockVerdict = installationSource.indexOf(
    "const singleInstanceRequired = !process.env.TRAIL_DATA_DIR;",
  );
  assert.ok(lockVerdict > 0);
  assert.doesNotMatch(installationSource, /process\.env\.TRAIL_DATA_DIR = dataDir;/);
  assert.match(entrySource, /from ["']\.\/installation["']/);
  assert.match(entrySource, /\.then\([\s\S]*?import\(["']\.\/index["']\)/);
});

test("downstream data directories follow the profile instead of the shipped default", async () => {
  const runtimeSource = await readMainModule("plugin-runtime.ts");
  assert.match(runtimeSource, /const root = desktopDataDir\(\);/);
  assert.doesNotMatch(runtimeSource, /join\(homedir\(\), "\.trail"\)/);

  // The plugin services already receive the resolved directory; the scratch
  // root was the one place that re-derived it.
  const servicesSource = await readMainModule("services/plugin-services.ts");
  assert.match(servicesSource, /return join\(dataDir, "scratch", sessionId\);/);
  assert.doesNotMatch(servicesSource, /join\(homedir\(\), "\.trail"\)/);
});
