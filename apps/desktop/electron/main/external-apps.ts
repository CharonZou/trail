/**
 * Starting an installed editor on a project folder.
 *
 * This is the only place in the app that turns a string into a program to run,
 * so it is deliberately closed: the caller names one of three ids and this
 * module decides which executable that id has on this machine. A renderer- or
 * plugin-supplied path, command, or argument never reaches `spawn`, and no
 * shell is involved — on Windows a `.cmd` or `.bat` launcher would need one,
 * which would put the user's project path inside a command line. A PATH wrapper
 * is therefore only a location hint: the real executable beside it is what
 * runs, and a wrapper with no executable beside it reads as not installed. The
 * path gate itself lives with the `project/openFolder` handler, which shares
 * this module; `shell.openPath` still owns the file-manager row (ADR 0109).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import type { OpenWithEditorApp, ProjectOpenWithResult } from "@trail/shared";

/** Every environment and filesystem read the resolver needs, injected. */
export type ExternalAppProbe = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  /** PATH lookup without a shell: returns the executable, or null. */
  which: (name: string) => string | null;
  isFile: (path: string) => boolean;
  /** Immediate subdirectory names of `parent`; empty when it does not exist. */
  listDirectories: (parent: string) => string[];
  /**
   * Windows only: resolve an exe name through the registry `App Paths`
   * registration (the same table `ShellExecute` uses). An editor installed to
   * a custom drive/folder registers its real .exe here even when it is not on
   * PATH and not under %ProgramFiles%. Returns the full exe path, or null.
   */
  registeredExe?: (exeName: string) => string | null;
};

/**
 * The real .exe name each editor registers under `App Paths`. Used as a
 * location hint like the fixed install roots, not as something the renderer can
 * choose.
 */
const REGISTRY_EXE_NAMES: Record<OpenWithEditorApp, readonly string[]> = {
  vscode: ["Code.exe"],
  trae: ["Trae.exe", "Trae CN.exe"],
  idea: ["idea64.exe"],
};

/**
 * A versioned install directory is matched by prefix, and the newest sort is
 * the one the user just updated. `exclude` keeps an uninstaller out of reach.
 */
type DirectoryCandidate = {
  parent: string;
  prefix: string;
  /** Path inside the matched directory; may itself be a prefixed segment. */
  relative: string;
  pick: "first" | "last";
  exclude?: RegExp;
};

type Candidate = { file: string } | { directory: DirectoryCandidate };

function isWindows(probe: ExternalAppProbe): boolean {
  return probe.platform === "win32";
}

function localAppData(env: Record<string, string | undefined>): string | null {
  return env.LOCALAPPDATA?.trim() || null;
}

function programFiles(env: Record<string, string | undefined>): string[] {
  return ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"]
    .map((key) => env[key]?.trim())
    .filter((value): value is string => Boolean(value));
}

function home(env: Record<string, string | undefined>): string | null {
  return env.HOME?.trim() || env.USERPROFILE?.trim() || null;
}

function joinPath(...parts: string[]): string {
  return parts.join("/");
}

/**
 * Where each id lives. The order is the answer: a command the user put on PATH
 * wins, then the vendor's documented install root, then a versioned directory
 * matched by prefix. Nothing here guesses a location the vendor does not use.
 */
function candidates(
  app: OpenWithEditorApp,
  probe: ExternalAppProbe,
): { pathNames: string[]; files: Candidate[] } {
  const { env } = probe;
  if (isWindows(probe)) {
    const local = localAppData(env);
    const roots = programFiles(env);
    if (app === "vscode") {
      return {
        pathNames: ["code.exe", "code.cmd"],
        files: [
          ...(local
            ? [
                {
                  file: joinPath(
                    local,
                    "Programs/Microsoft VS Code/Code.exe",
                  ),
                },
              ]
            : []),
          ...roots.map((root) => ({
            file: joinPath(root, "Microsoft VS Code/Code.exe"),
          })),
        ],
      };
    }
    if (app === "trae") {
      return {
        pathNames: ["trae.exe", "trae.cmd"],
        files: [
          ...(local
            ? [
                { file: joinPath(local, "Programs/Trae/Trae.exe") },
                { file: joinPath(local, "Programs/Trae CN/Trae CN.exe") },
                {
                  directory: {
                    parent: joinPath(local, "Programs"),
                    prefix: "Trae",
                    relative: "Trae",
                    pick: "first" as const,
                    exclude: /unins/i,
                  },
                },
              ]
            : []),
          ...roots.map((root) => ({
            file: joinPath(root, "Trae/Trae.exe"),
          })),
        ],
      };
    }
    return {
      pathNames: ["idea64.exe", "idea.bat"],
      files: [
        ...roots.map((root) => ({
          directory: {
            parent: joinPath(root, "JetBrains"),
            prefix: "IntelliJ IDEA",
            relative: "bin/idea64.exe",
            pick: "last" as const,
          },
        })),
        ...(local
          ? [
              {
                directory: {
                  parent: joinPath(local, "JetBrains/Toolbox/apps"),
                  prefix: "IDEA",
                  relative: "bin/idea64.exe",
                  pick: "last" as const,
                },
              },
              {
                directory: {
                  parent: joinPath(local, "JetBrains/Toolbox/apps"),
                  prefix: "idea",
                  relative: "bin/idea64.exe",
                  pick: "last" as const,
                },
              },
            ]
          : []),
      ],
    };
  }

  if (probe.platform === "darwin") {
    if (app === "vscode") {
      return {
        pathNames: ["code"],
        files: [
          {
            file: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
          },
          {
            file: "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code",
          },
        ],
      };
    }
    if (app === "trae") {
      return {
        pathNames: ["trae"],
        files: [
          { file: "/Applications/Trae.app/Contents/Resources/app/bin/trae" },
          { file: "/Applications/Trae CN.app/Contents/Resources/app/bin/trae" },
        ],
      };
    }
    return {
      pathNames: ["idea"],
      files: [
        { file: "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea" },
        { file: "/Applications/IntelliJ IDEA CE.app/Contents/MacOS/idea" },
        {
          directory: {
            parent: home(env)
              ? joinPath(home(env) as string, "Applications/JetBrains Toolbox/apps")
              : "",
            prefix: "IntelliJ IDEA",
            relative: "Contents/MacOS/idea",
            pick: "last",
          },
        },
      ],
    };
  }

  return {
    pathNames: [app === "vscode" ? "code" : app === "trae" ? "trae" : "idea"],
    files: [
      ...(app === "idea"
        ? [
            {
              directory: {
                parent: home(env)
                  ? joinPath(home(env) as string, ".local/share/JetBrains/Toolbox/apps")
                  : "",
                prefix: "IDEA",
                relative: "bin/idea",
                pick: "last" as const,
              },
            },
          ]
        : []),
    ],
  };
}

function resolveDirectory(
  candidate: DirectoryCandidate,
  probe: ExternalAppProbe,
): string | null {
  if (!candidate.parent) return null;
  // A prefixed segment inside the relative path (Trae's own executable) is
  // matched the same way as the directory name.
  const [head = "", ...rest] = candidate.relative.split("/");
  const matches = probe
    .listDirectories(candidate.parent)
    .filter((name) => name.startsWith(candidate.prefix))
    .filter((name) => !candidate.exclude?.test(name))
    .sort((left, right) => left.localeCompare(right));
  if (!matches.length) return null;
  const chosen = candidate.pick === "last" ? matches[matches.length - 1] : matches[0];
  if (!chosen) return null;
  if (!rest.length) {
    // The executable sits directly in the matched directory and shares its
    // name prefix, e.g. `Trae CN/Trae CN.exe`.
    const siblings = probe
      .listDirectories(joinPath(candidate.parent, chosen))
      .filter((name) => name.startsWith(head))
      .filter((name) => !candidate.exclude?.test(name))
      .sort((left, right) => left.localeCompare(right));
    for (const sibling of candidate.pick === "last" ? [...siblings].reverse() : siblings) {
      const path = joinPath(candidate.parent, chosen, sibling);
      if (probe.isFile(path)) return path;
    }
    return null;
  }
  for (const match of candidate.pick === "last" ? [...matches].reverse() : matches) {
    const path = joinPath(candidate.parent, match, candidate.relative);
    if (probe.isFile(path)) return path;
  }
  return null;
}

/**
 * The real executable that sits beside a vendor's PATH shell wrapper. Editors
 * installed on a custom drive are often only reachable through `bin/code.cmd`
 * & co.; the wrapper itself must never run, but its location names the install
 * root, so the executable one or two levels up is a closed, verifiable hit.
 */
const WINDOWS_WRAPPER_EXES: Record<OpenWithEditorApp, readonly string[]> = {
  vscode: ["Code.exe"],
  trae: ["Trae.exe", "Trae CN.exe"],
  idea: ["idea64.exe", "idea.exe"],
};

function exeNearWrapper(
  app: OpenWithEditorApp,
  wrapper: string,
  probe: ExternalAppProbe,
): string | null {
  let dir = wrapper.replace(/\\/g, "/");
  for (let up = 0; up < 2; up += 1) {
    const cut = dir.lastIndexOf("/");
    if (cut <= 0) return null;
    dir = dir.slice(0, cut);
    for (const name of WINDOWS_WRAPPER_EXES[app]) {
      const candidate = `${dir}/${name}`;
      if (probe.isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** The executable for one id on this machine, or null when it is not there. */
export function resolveExternalApp(
  app: OpenWithEditorApp,
  probe: ExternalAppProbe,
): string | null {
  const table = candidates(app, probe);
  for (const name of table.pathNames) {
    const found = probe.which(name);
    if (!found) continue;
    // Windows is the only family where a PATH hit can be a shell wrapper, and
    // a wrapper is not something this module is allowed to start. Its location
    // still names the install root, so look for the real executable beside it.
    if (!isWindows(probe)) return found;
    if (found.toLowerCase().endsWith(".exe")) return found;
    const beside = exeNearWrapper(app, found, probe);
    if (beside) return beside;
  }
  // PATH missed: the editor may still be registered under App Paths while
  // installed to a custom folder (e.g. D:\Visual Studio Code\...). This is a
  // host-side registry read, not a renderer-supplied path.
  if (isWindows(probe) && probe.registeredExe) {
    for (const exeName of REGISTRY_EXE_NAMES[app]) {
      const registered = probe.registeredExe(exeName);
      if (registered && probe.isFile(registered)) return registered;
    }
  }
  for (const candidate of table.files) {
    if ("file" in candidate) {
      if (candidate.file && probe.isFile(candidate.file)) return candidate.file;
      continue;
    }
    const resolved = resolveDirectory(candidate.directory, probe);
    if (resolved) return resolved;
  }
  return null;
}

export type ExternalAppLauncher = {
  open: (app: OpenWithEditorApp, path: string) => Promise<ProjectOpenWithResult>;
};

type SpawnChild = { unref: () => void };

export type ExternalAppLauncherDependencies = {
  probe: ExternalAppProbe;
  /** `node:child_process.spawn` shaped so the call is assertable. */
  spawn: (
    command: string,
    args: string[],
    options: { detached: boolean; stdio: "ignore" },
  ) => SpawnChild;
  stripWinLongPrefix: (path: string) => string;
  log: (event: string, detail?: Record<string, unknown>) => void;
};

/**
 * Launch and forget: the editor is a GUI process the user now owns, so the app
 * keeps no handle on it and reads nothing from it. A spawn failure is logged
 * with its OS detail and reported to the user as a reason code, never as the
 * raw message.
 */
export function createExternalAppLauncher(
  dependencies: ExternalAppLauncherDependencies,
): ExternalAppLauncher {
  const { probe, spawn, stripWinLongPrefix, log } = dependencies;
  return {
    async open(app, path) {
      const executable = resolveExternalApp(app, probe);
      if (!executable) {
        log("project.open-with.not-installed", { app, platform: probe.platform });
        return { ok: false, reason: "not_installed", app };
      }
      try {
        const child = spawn(executable, [stripWinLongPrefix(path)], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        return { ok: true, app, path };
      } catch (error) {
        log("project.open-with.launch.failed", {
          app,
          executable,
          detail: error instanceof Error ? error.message : String(error),
        });
        return { ok: false, reason: "launch_failed", app };
      }
    },
  };
}

/** The real probe, built from this process's environment and filesystem. */
export function createExternalAppProbe(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): ExternalAppProbe {
  return {
    platform,
    env,
    which: (name) => {
      const entries = (env.PATH ?? env.path ?? "").split(platform === "win32" ? ";" : ":");
      for (const entry of entries) {
        if (!entry) continue;
        const candidate = `${entry.replace(/\\/g, "/").replace(/\/$/, "")}/${name}`;
        if (isFileQuiet(candidate)) return candidate;
      }
      return null;
    },
    isFile: isFileQuiet,
    listDirectories: (parent) => {
      try {
        return readdirSync(parent);
      } catch {
        return [];
      }
    },
    registeredExe:
      platform === "win32"
        ? queryAppPathsRegistry
        : undefined,
  };
}

/**
 * Resolve an exe through the Windows `App Paths` registry table by shelling out
 * to `reg query`. This is a host-side probe (the same category as `which`),
 * never a renderer-supplied path; `reg.exe` is spawned directly, not through a
 * shell. A missing key or any failure simply yields null and the resolver
 * falls through to the fixed install locations.
 */
function queryAppPathsRegistry(exeName: string): string | null {
  const roots = [
    `HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths`,
    `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths`,
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths`,
  ];
  // reg.exe lives in System32 on every Windows; resolve it by SystemRoot
  // instead of PATH, which a packaged/launched Electron process may not carry.
  const regExe = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\reg.exe`;
  for (const root of roots) {
    try {
      // Decode as latin1: reg.exe on a localized Windows prints "(Default)" in
      // the system ANSI codepage (e.g. "(默认)" in GBK), but the REG_SZ value
      // we want is an ASCII path, so latin1 preserves it byte-for-byte without
      // depending on Node iconv support for the codepage.
      const out = execFileSync(
        regExe,
        ["query", `${root}\\${exeName}`, "/ve"],
        { windowsHide: true, timeout: 2000 },
      ).toString("latin1");
      // Match the REG_SZ line directly rather than the localized "(Default)"
      // label; /ve returns exactly one value, the default.
      const match = out.match(/REG_SZ\s+(.+)/);
      const value = match?.[1].trim().replace(/^"|"$/g, "");
      if (value) return value;
    } catch {
      // Key absent / reg failed — try the next hive.
    }
  }
  return null;
}

function isFileQuiet(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
