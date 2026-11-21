/**
 * Renderer copy of the app icon record (Settings ▸ General ▸ Appearance ▸
 * App icon).
 *
 * The main process owns the record and repaints the native window, taskbar and
 * dock icon. In-app marks — the sidebar brand, the startup logo — and the page
 * favicon read it from here, so a pick reaches every surface in the same
 * session instead of only the ones that happened to be wired directly.
 *
 * The store fetches once, lazily, and is published by whoever reads or writes
 * the record so a selection repaints immediately.
 */
import { useSyncExternalStore } from "react";
import type { AppIconState } from "@trail/shared";
import { api } from "./api";

let state: AppIconState | null = null;
let loading = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Publish a record a caller just read or saved. */
export function setAppIconState(next: AppIconState): void {
  state = next;
  emit();
}

export function getAppIconState(): AppIconState | null {
  return state;
}

function load(): void {
  if (loading || state) return;
  loading = true;
  void api
    .getAppIcon()
    .then((next) => {
      if (!state) setAppIconState(next);
    })
    .catch(() => {
      // A missing record keeps the shipped brand mark.
    })
    .finally(() => {
      loading = false;
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!state) queueMicrotask(load);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppIconState(): AppIconState | null {
  return useSyncExternalStore(subscribe, getAppIconState, () => null);
}
