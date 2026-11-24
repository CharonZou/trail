import { readAppSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const railSource = await readFile(
  new URL("../src/components/SidebarRail.tsx", import.meta.url),
  "utf8",
);
const appSource = await readAppSource();
const globalStyles = await loadStyles();

test("a collapsed shell keeps the left column as an icon rail", () => {
  // The expanded branch still owns the sidebar and its exit animation; only the
  // fully collapsed state swaps in the rail, so the wipe never animates two
  // plates at once.
  assert.match(appSource, /!sidebarCollapsed \|\| sidebarExiting \?/);
  assert.match(appSource, /\) : \(\n\s*\/\* Collapsed: the icon rail[\s\S]*?<SidebarRail/);
  assert.match(appSource, /<SidebarRail className=\{sidebarEntering \? "is-entering" : undefined\} \/>/);
});

test("the rail exposes every destination as a 36px seat", () => {
  // The shared surface rule also names `.sidebar-rail`, so anchor on the seat
  // block that starts with the rail's width instead of taking the first match.
  const railBlock =
    globalStyles.match(/\n\.sidebar-rail\s*\{\n\s*width:[\s\S]*?\}/)?.[0] ?? "";
  assert.match(railBlock, /width:\s*var\(--ds-sidebar-rail-width,\s*56px\)/);
  assert.match(railBlock, /flex:\s*0 0 var\(--ds-sidebar-rail-width,\s*56px\)/);
  const seatBlock = globalStyles.match(/\.sidebar-rail-btn\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(seatBlock, /height:\s*36px/);
  assert.match(seatBlock, /border-radius:\s*var\(--radius-md\)/);
  assert.match(seatBlock, /color:\s*var\(--ds-text-muted\)/);
});

test("the rail marks the current page with the shared active tile", () => {
  // Same signal as the expanded extensions list: the active destination keeps
  // the `--ds-bg-active` seat, so collapsing cannot lose "where am I".
  const activeBlock =
    globalStyles.match(/\.sidebar-rail-btn\.active\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(activeBlock, /background:\s*var\(--ds-bg-active\)/);
  assert.match(activeBlock, /color:\s*var\(--ds-text-primary\)/);
  assert.match(railSource, /page === target && "active"/);
  assert.match(railSource, /aria-pressed={page === target}/);
});

test("the rail carries the same destinations and footer cluster as the sidebar", () => {
  for (const navId of ["home", "assets", "plugins", "knowledge", "apps"]) {
    const target = navId === "home" ? "chat" : navId;
    assert.match(railSource, new RegExp(`item\\("${target}", "${navId}"`));
  }
  for (const navId of ["settings", "scheduled"]) {
    assert.match(railSource, new RegExp(`item\\("${navId}", "${navId}"`));
  }
  // The notification trigger takes the rail's seat size and a matching glyph.
  assert.match(railSource, /<NotificationCenter iconSize=\{18\} \/>/);
  assert.match(
    globalStyles,
    /\.sidebar-rail \.notification-trigger\s*\{[\s\S]*?height:\s*36px/,
  );
  // Pressing the current destination steps back, never traps the user.
  assert.match(railSource, /if \(page === target\)[\s\S]*?canNavBack\(\)[\s\S]*?navBack\(\)/);
});

test("both window frames read the rail on the shell ground", () => {
  // The rail never paints its own plate: it shares the sidebar surface rule,
  // which is also the floating shell's ground, so `window` and `floating` only
  // differ in how the pane is plated and never in the rail.
  assert.match(
    globalStyles,
    /\.sidebar-surface,\n\.sidebar-rail\s*\{[\s\S]*?background-color:\s*var\(--ds-bg-sidebar/,
  );
  assert.doesNotMatch(
    globalStyles,
    /\.app-shell\.app-frame-floating .sidebar-rail\s*\{/,
  );
});

test("preview chrome starts after the rail when the sidebar is collapsed", () => {
  assert.match(
    globalStyles,
    /\.window-chrome-row\.sidebar-collapsed\s*\{[\s\S]*?left:\s*var\(--ds-sidebar-rail-width,\s*56px\)/,
  );
  assert.match(appSource, /sidebarCollapsed \? "sidebar-collapsed" : "sidebar-expanded"/);
});
