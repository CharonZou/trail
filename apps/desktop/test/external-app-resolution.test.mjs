import assert from "node:assert/strict";
import test from "node:test";
import {
  createExternalAppLauncher,
  resolveExternalApp,
} from "../electron/main/external-apps.ts";

/*
 * The candidate table is the whole risk surface of this feature: it decides
 * which executable the app is allowed to start. It is pure — every environment
 * and filesystem read is injected — so the table is proven here without an
 * installed IDE, and the launcher is proven with a fake spawn.
 */

function probe({
  platform = "win32",
  env = {},
  files = [],
  directories = {},
  path = {},
} = {}) {
  const fileSet = new Set(files);
  return {
    platform,
    env,
    which: (name) => path[name] ?? null,
    isFile: (candidate) => fileSet.has(candidate),
    listDirectories: (parent) => directories[parent] ?? [],
  };
}

const LOCAL = "C:/Users/dev/AppData/Local";
const PF = "C:/Program Files";

test("Windows resolves only real executables, never a .cmd or .bat", () => {
  const resolved = resolveExternalApp(
    "vscode",
    probe({
      env: { LOCALAPPDATA: LOCAL },
      path: { "code.exe": "C:/tools/code.exe" },
    }),
  );
  assert.equal(resolved, "C:/tools/code.exe");

  // A PATH entry that is only a shell wrapper is refused: spawning it needs a
  // shell, and a shell would put the project path inside a command line. With
  // no executable beside it, the wrapper alone reads as not installed.
  const wrapperOnly = resolveExternalApp(
    "vscode",
    probe({
      env: { LOCALAPPDATA: LOCAL },
      path: {
        "code.cmd": "C:/Users/dev/AppData/Local/Programs/Microsoft VS Code/bin/code.cmd",
      },
    }),
  );
  assert.equal(wrapperOnly, null);
});

test("a custom-drive install is found through its PATH wrapper, never the wrapper", () => {
  // VS Code on a non-default drive: only bin/code.cmd is on PATH, and the real
  // executable sits one level above the wrapper's directory.
  const root = "D:/Visual Studio Code/Microsoft VS Code";
  assert.equal(
    resolveExternalApp(
      "vscode",
      probe({
        env: { LOCALAPPDATA: LOCAL },
        path: { "code.cmd": `${root}/bin/code.cmd` },
        files: [`${root}/Code.exe`],
      }),
    ),
    `${root}/Code.exe`,
  );

  // The same derivation covers the other vendors' wrappers and regional exe
  // names, and it still refuses to return the wrapper itself.
  assert.equal(
    resolveExternalApp(
      "trae",
      probe({
        env: {},
        path: { "trae.cmd": "E:/Apps/Trae CN/bin/trae.cmd" },
        files: ["E:/Apps/Trae CN/Trae CN.exe"],
      }),
    ),
    "E:/Apps/Trae CN/Trae CN.exe",
  );
  assert.equal(
    resolveExternalApp(
      "idea",
      probe({
        env: {},
        path: { "idea.bat": "E:/Apps/IDEA/bin/idea.bat" },
        files: ["E:/Apps/IDEA/bin/idea64.exe"],
      }),
    ),
    "E:/Apps/IDEA/bin/idea64.exe",
  );
});

test("Windows falls back to the documented install roots", () => {
  assert.equal(
    resolveExternalApp(
      "vscode",
      probe({
        env: { LOCALAPPDATA: LOCAL },
        files: [`${LOCAL}/Programs/Microsoft VS Code/Code.exe`],
      }),
    ),
    `${LOCAL}/Programs/Microsoft VS Code/Code.exe`,
  );

  // Trae ships regional and channel variants; the uninstaller is never a hit.
  const trae = resolveExternalApp(
    "trae",
    probe({
      env: { LOCALAPPDATA: LOCAL },
      directories: {
        [`${LOCAL}/Programs`]: ["Trae", "Trae CN"],
      },
      files: [
        `${LOCAL}/Programs/Trae/unins000.exe`,
        `${LOCAL}/Programs/Trae CN/Trae CN.exe`,
      ],
    }),
  );
  assert.equal(trae, `${LOCAL}/Programs/Trae CN/Trae CN.exe`);

  // JetBrains installs are versioned directories; the newest sort wins.
  const idea = resolveExternalApp(
    "idea",
    probe({
      env: { ProgramFiles: PF, LOCALAPPDATA: LOCAL },
      directories: {
        [`${PF}/JetBrains`]: ["IntelliJ IDEA 2025.2", "IntelliJ IDEA 2026.1"],
      },
      files: [
        `${PF}/JetBrains/IntelliJ IDEA 2025.2/bin/idea64.exe`,
        `${PF}/JetBrains/IntelliJ IDEA 2026.1/bin/idea64.exe`,
      ],
    }),
  );
  assert.equal(idea, `${PF}/JetBrains/IntelliJ IDEA 2026.1/bin/idea64.exe`);
});

test("Windows variant install directories resolve by prefix and skip the uninstaller", () => {
  const resolved = resolveExternalApp(
    "trae",
    probe({
      env: { LOCALAPPDATA: LOCAL },
      directories: {
        [`${LOCAL}/Programs`]: ["Trae SOLO CN"],
        [`${LOCAL}/Programs/Trae SOLO CN`]: ["unins000.exe", "Trae SOLO CN.exe"],
      },
      files: [
        `${LOCAL}/Programs/Trae SOLO CN/unins000.exe`,
        `${LOCAL}/Programs/Trae SOLO CN/Trae SOLO CN.exe`,
      ],
    }),
  );
  assert.equal(resolved, `${LOCAL}/Programs/Trae SOLO CN/Trae SOLO CN.exe`);
});

test("macOS resolves the app-bundle executables", () => {
  assert.equal(
    resolveExternalApp(
      "vscode",
      probe({
        platform: "darwin",
        files: [
          "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
          "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        ],
      }),
    ),
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  );
  assert.equal(
    resolveExternalApp(
      "idea",
      probe({
        platform: "darwin",
        files: ["/Applications/IntelliJ IDEA.app/Contents/MacOS/idea"],
      }),
    ),
    "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea",
  );
});

test("Linux and macOS accept the command-line launcher found on PATH", () => {
  assert.equal(
    resolveExternalApp(
      "trae",
      probe({ platform: "linux", path: { trae: "/usr/local/bin/trae" } }),
    ),
    "/usr/local/bin/trae",
  );
});

test("an unresolvable program is reported as missing rather than guessed", () => {
  assert.equal(resolveExternalApp("idea", probe({ env: {} })), null);
  assert.equal(
    resolveExternalApp("vscode", probe({ env: { LOCALAPPDATA: LOCAL }, files: [] })),
    null,
  );
});

test("the launcher spawns the resolved executable with the folder as its only argument", async () => {
  const calls = [];
  const launcher = createExternalAppLauncher({
    probe: probe({
      env: { LOCALAPPDATA: LOCAL },
      files: [`${LOCAL}/Programs/Microsoft VS Code/Code.exe`],
    }),
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return { unref: () => calls.push({ unrefed: true }) };
    },
    stripWinLongPrefix: (value) => value,
    log: () => {},
  });

  const result = await launcher.open("vscode", "D:/projects/demo");
  assert.deepEqual(result, { ok: true, app: "vscode", path: "D:/projects/demo" });
  assert.equal(calls[0].command, `${LOCAL}/Programs/Microsoft VS Code/Code.exe`);
  assert.deepEqual(calls[0].args, ["D:/projects/demo"]);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, "ignore");
  assert.equal(calls[0].options.shell, undefined);
  assert.deepEqual(calls.find((call) => call.unrefed), { unrefed: true });
});

test("the launcher strips the Windows long-path prefix before spawning", async () => {
  const calls = [];
  const launcher = createExternalAppLauncher({
    probe: probe({ path: { "code.exe": "/bin/code.exe" } }),
    spawn: (command, args) => {
      calls.push(args);
      return { unref: () => {} };
    },
    stripWinLongPrefix: (value) => value.replace(/^\\\\\?\\/, ""),
    log: () => {},
  });
  await launcher.open("vscode", "\\\\?\\D:/projects/demo");
  assert.deepEqual(calls[0], ["D:/projects/demo"]);
});

test("a missing program and a failed spawn are separate structured outcomes", async () => {
  const missing = createExternalAppLauncher({
    probe: probe({ env: {} }),
    spawn: () => ({ unref: () => {} }),
    stripWinLongPrefix: (value) => value,
    log: () => {},
  });
  assert.deepEqual(await missing.open("trae", "/tmp/demo"), {
    ok: false,
    reason: "not_installed",
    app: "trae",
  });

  const failing = createExternalAppLauncher({
    probe: probe({ path: { "code.exe": "/bin/code.exe" } }),
    spawn: () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    stripWinLongPrefix: (value) => value,
    log: (event, detail) => assert.equal(event, "project.open-with.launch.failed"),
  });
  assert.deepEqual(await failing.open("vscode", "/tmp/demo"), {
    ok: false,
    reason: "launch_failed",
    app: "vscode",
  });
});
