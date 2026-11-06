import type { ProjectMemory } from "./filesystem.js";

/** Shared public types grouped by the owning application domain. */
export type AppNotificationKind = "task.completed" | "task.failed";

export type AppNotification = {
  id: string;
  kind: AppNotificationKind;
  sessionId: string;
  sessionTitle: string;
  turnId: string;
  errorCode?: string;
  createdAt: string;
  readAt?: string | null;
};

export type NotificationListResult = {
  notifications: AppNotification[];
  unreadCount: number;
};

export type RemoteWorkspace = { hostKey: string; path: string };

export type ProjectWorkspace = {
  remote?: RemoteWorkspace;
  path: string;
  name: string;
  /** Best-effort git branch from .git/HEAD when available. */
  branch?: string;
};

export type ProjectRecord = {
  id: number;
  path: string;
  name: string;
  pinned: boolean;
  createdAt: number;
  lastOpenedAt: number;
};

export type ProjectGroupRoot = {
  path: string;
  name: string;
  position: number;
};

/**
 * Icon id and tint the user picked for one project. `icon` is an id from the
 * renderer's catalog (an unknown id falls back to the folder glyph) and
 * `color` is a `#rrggbb` string; both are absent for an untouched project.
 */
export type ProjectGroupAppearance = {
  icon?: string | null;
  color?: string | null;
};

export type ProjectGroupRecord = {
  remote?: RemoteWorkspace;
  id: string;
  name: string;
  primaryPath: string;
  roots: ProjectGroupRoot[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  lastOpenedAt: number;
  /** True for a compatibility projection of an old single-folder project. */
  legacy?: boolean;
  /** Previously removed roots remain suppressed from legacy projections. */
  detachedPaths?: string[];
  /** When false, the workspace file index is never built for this project. */
  workspaceIndex?: boolean;
  /** Icon and tint the user picked; absent keeps the historical folder glyph. */
  appearance?: ProjectGroupAppearance;
};

export type ProjectGroupContext = {
  remote?: RemoteWorkspace;
  groupId: string;
  roots: ProjectGroupRoot[];
  instructions: string;
  memory: ProjectMemory;
};

/**
 * `authKind` for a provider row whose credential is a vendor-account OAuth
 * login rather than a pasted API key. Shared so main, the sidecar runtime and
 * the renderer all branch on the same spelling.
 */
