import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The two directories that define an installation, and the development split
 * between them.
 *
 * A packaged install and a `pnpm dev` host used to share both: the
 * name-derived `userData` — where Electron keeps the single-instance lock,
 * renderer `localStorage`, and the plugin panel partitions — and
 * `~/.trail`, where host-core keeps `pi.sqlite` beside the persistence
 * outbox and the log tree. Sharing them meant a shipped app that was already
 * running held the lock, so the development launch quit on arrival; a
 * development host that won the race instead put a second host-core over the
 * same single-writer database, which is the divergence D236 exists to
 * prevent. Neither is workable while someone debugs against the app they use.
 *
 * Only the development side moves, and only these two names differ. Both
 * profiles are named for the `Trail` brand; `TRAIL_DATA_DIR` still overrides
 * either profile outright.
 *
 * The pre-Trail releases wrote their profiles under the `PI-Desktop` names, so
 * each resolution below falls back to the legacy directory when the Trail one
 * has not been created yet. Falling back rather than migrating keeps an
 * upgraded install on the tree that already holds its sessions, lock,
 * `localStorage`, and plugin partitions, and never copies a live database.
 */

/** `userData` directory of a packaged installation. */
export const PACKAGED_INSTALLATION_NAME = "Trail";

/** `userData` directory of a development installation, beside the shipped one. */
export const DEVELOPMENT_INSTALLATION_NAME = "Trail Dev";

/** Data directory of a shipped installation, below the user's home. */
export const INSTALLATION_DATA_DIR_NAME = ".trail";

/** Data directory of a development installation, below the user's home. */
export const DEVELOPMENT_DATA_DIR_NAME = ".trail-dev";

/** `userData` names written by the pre-Trail releases. */
const LEGACY_PACKAGED_INSTALLATION_NAME = "PI-Desktop";
const LEGACY_DEVELOPMENT_INSTALLATION_NAME = "PI-Desktop Dev";

/** Home data directory names written by the pre-Trail releases. */
const LEGACY_INSTALLATION_DATA_DIR_NAME = ".pi-desktop";
const LEGACY_DEVELOPMENT_DATA_DIR_NAME = ".pi-desktop-dev";

/** The Trail name, unless only the legacy profile exists. */
function pickProfileName(
  preferred: string,
  legacy: string,
  parent: string,
  exists: (path: string) => boolean,
): string {
  if (exists(join(parent, preferred)) || !exists(join(parent, legacy))) return preferred;
  return legacy;
}

export type DataDirInput = {
  /** `TRAIL_DATA_DIR`; an explicit directory wins over either profile. */
  override: string | undefined;
  /** True for a development build. */
  development: boolean;
  /** The user's home directory. */
  home: string;
  /** Existence probe, injectable so tests stay off the real filesystem. */
  exists?: (path: string) => boolean;
};

/**
 * The data directory one installation owns.
 *
 * `TRAIL_DATA_DIR` stays the escape hatch it always was: an explicit
 * directory wins, which is how the E2E harnesses, the capture rig, and
 * side-by-side profiles keep choosing their own root. The result is absolute,
 * because it reaches host-core as a child-process environment variable from a
 * working directory that need not be this one, and because `homedir()` is the
 * only other input that could be relative. Without an override the profile
 * picks the name, and that name is the whole difference between the two
 * installations.
 */
export function resolveDataDir({
  override,
  development,
  home,
  exists = existsSync,
}: DataDirInput): string {
  const explicit = override?.trim();
  if (explicit) return resolve(explicit);
  return resolve(
    join(
      home,
      pickProfileName(
        development ? DEVELOPMENT_DATA_DIR_NAME : INSTALLATION_DATA_DIR_NAME,
        development ? LEGACY_DEVELOPMENT_DATA_DIR_NAME : LEGACY_INSTALLATION_DATA_DIR_NAME,
        home,
        exists,
      ),
    ),
  );
}

/**
 * The data directory this process owns.
 *
 * Electron main passes its own verdict for `development`, because only it can
 * ask `app.isPackaged`, and it publishes the resolved directory back to
 * `TRAIL_DATA_DIR` at boot. That publication is what keeps the plugin
 * runtime — which resolves this root from the environment rather than taking
 * it as a parameter — on one directory instead of falling back to the shipped
 * default, which would strand a development host's plugin data inside the
 * packaged profile.
 */
export function desktopDataDir(
  development: boolean = process.env.TRAIL_DEV === "1",
): string {
  return resolveDataDir({
    override: process.env.TRAIL_DATA_DIR,
    development,
    home: homedir(),
  });
}

/**
 * The home data directory the pre-Trail releases created for a profile.
 *
 * A pointer persisted under the old brand keeps naming this directory, so the
 * storage bootstrap compares it against the current default and adopts the
 * Trail directory once that one exists.
 */
export function legacyDataDir(development: boolean = process.env.TRAIL_DEV === "1"): string {
  return resolve(
    join(
      homedir(),
      development ? LEGACY_DEVELOPMENT_DATA_DIR_NAME : LEGACY_INSTALLATION_DATA_DIR_NAME,
    ),
  );
}

/** The Electron `app` surface this helper needs; kept structural so tests need no Electron. */
export type UserDataApp = {
  commandLine: { hasSwitch(name: string): boolean };
  getPath(name: "appData"): string;
  setPath(name: "userData", path: string): void;
};

/**
 * Give a development build its own `userData` so the single-instance lock
 * does not collide with a shipped app that is already running (D236, ADR 0094).
 * An explicit `--user-data-dir` wins, because that is how the E2E harnesses
 * point a build at a throwaway profile.
 */
export function applyDevelopmentUserData(
  app: UserDataApp,
  development: boolean,
  exists: (path: string) => boolean = existsSync,
): void {
  if (development && !app.commandLine.hasSwitch("user-data-dir")) {
    const appData = app.getPath("appData");
    app.setPath(
      "userData",
      join(
        appData,
        pickProfileName(
          DEVELOPMENT_INSTALLATION_NAME,
          LEGACY_DEVELOPMENT_INSTALLATION_NAME,
          appData,
          exists,
        ),
      ),
    );
  }
}

/**
 * Name the packaged `userData` after the brand, or after the pre-Trail release
 * when that is the profile the installation already has. `app.setName` carries
 * the display brand and Electron derives the default packaged `userData` from
 * it, so this is the one place that decides which profile directory holds
 * localStorage, the single-instance lock, and the plugin partitions. An
 * explicit `--user-data-dir` wins.
 */
export function applyPackagedUserData(
  app: UserDataApp,
  packaged: boolean,
  exists: (path: string) => boolean = existsSync,
): void {
  if (packaged && !app.commandLine.hasSwitch("user-data-dir")) {
    const appData = app.getPath("appData");
    app.setPath(
      "userData",
      join(
        appData,
        pickProfileName(
          PACKAGED_INSTALLATION_NAME,
          LEGACY_PACKAGED_INSTALLATION_NAME,
          appData,
          exists,
        ),
      ),
    );
  }
}
