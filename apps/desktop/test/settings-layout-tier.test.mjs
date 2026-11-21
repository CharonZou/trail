/**
 * Settings page layout tier (Full / Compact).
 *
 * Guards the Settings page's own size tier: the stored field stays optional and
 * absent means the shipped full-window page, the shell's top-left icon button
 * swaps between the tiers, its top-right counterpart closes the page, the
 * compact tier restyles the same tree as a centered panel over the live app,
 * and none of it moves a pixel of the full tier.
 *
 * The main window frame (`appFrame`, General ▸ Appearance ▸ 界面排版) is a
 * different preference and is guarded in settings-app-frame.test.mjs.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { loadStylesSync } from "./helpers/styles.mjs";
import {
  readMainSourceSync,
  readSettingsSourceSync,
  readSharedTypesSourceSync,
} from "./helpers/source-contracts.mjs";

const settings = readSettingsSourceSync();
const sharedTypes = readSharedTypesSourceSync();
const mainSource = readMainSourceSync();
const appShellSource = readFileSync(
  new URL("../src/features/app/AppShell.tsx", import.meta.url),
  "utf8",
);
const shellRuntimeSource = readFileSync(
  new URL("../src/features/app/useAppShellRuntime.tsx", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const settingsNav = readFileSync(new URL("../src/lib/settings-search.ts", import.meta.url), "utf8");
const tierSource = readFileSync(new URL("../src/lib/settings-tier.ts", import.meta.url), "utf8");
const styles = loadStylesSync();
const settingsCss = readFileSync(new URL("../src/styles/settings.css", import.meta.url), "utf8");
const chromeCss = readFileSync(new URL("../src/styles/chrome.css", import.meta.url), "utf8");
const iconsSource = readFileSync(new URL("../src/components/icons.tsx", import.meta.url), "utf8");

function cssRule(selector) {
  const from = styles.indexOf(`\n${selector} {`);
  assert.ok(from >= 0, `${selector} rule missing`);
  return styles.slice(from, styles.indexOf("}", from));
}

/** Same slice against one sheet, for a class that also joins a shared group. */
function cssRuleIn(source, selector) {
  const from = source.indexOf(`\n${selector} {`);
  assert.ok(from >= 0, `${selector} rule missing`);
  return source.slice(from, source.indexOf("}", from));
}

test("the layout tier is an optional field validated on both write paths", () => {
  assert.match(sharedTypes, /settingsLayout\?: "full" \| "compact"/);
  assert.match(apiSource, /hasOwnProperty\.call\(settings, "settingsLayout"\)/);
  assert.match(apiSource, /settingsLayout is invalid/);
  assert.match(mainSource, /hasOwnProperty\.call\(value, "settingsLayout"\)/);
  assert.match(mainSource, /settingsLayout is invalid/);
});

test("an absent tier resolves to the shipped full-window page", () => {
  // One resolver owns the persisted field, because two surfaces read it: the
  // page restyles itself and the shell decides what paints under the scrim.
  assert.match(tierSource, /settings\?\.settingsLayout === "compact" \? "compact" : "full"/);
  assert.match(settings, /const settingsLayout = settingsTierOf\(settings\);/);
  assert.match(
    shellRuntimeSource,
    /const settingsCompact = page === "settings" && settingsTierOf\(settings\) === "compact";/,
  );
  assert.doesNotMatch(settings, /settings\?\.settingsLayout ===/);
  assert.doesNotMatch(shellRuntimeSource, /settings\?\.settingsLayout ===/);
  assert.match(
    settings,
    /cx\(\s*"settings-shell",\s*"settings-shell-full",\s*settingsLayout === "compact" && "settings-shell-compact",\s*\)/,
  );
  // A size tier is not a destination: the shared index stays untouched by it.
  assert.doesNotMatch(settingsNav, /settingsLayout/);
});

test("the tier swap is one icon button in the shell's top-left corner", () => {
  // The swap lives inside the rail's drag strip so its `no-drag` hole is
  // subtracted after that strip's caption rectangle: a sibling painted before
  // the strip would have the corner reclaimed and the press turn into a drag.
  const swapIndex = settings.indexOf('className="settings-tier-swap no-drag"');
  const bandIndex = settings.indexOf('className="settings-titlebar"');
  const navTopIndex = settings.indexOf('className="settings-nav-top drag"');
  assert.ok(swapIndex >= 0, "tier swap control missing");
  assert.ok(
    swapIndex > bandIndex,
    "the swap control must follow the drag band, which paints over earlier siblings",
  );
  assert.ok(
    swapIndex > navTopIndex,
    "the swap must sit inside the rail's drag strip, not before it",
  );
  // Nothing in the rail may close the strip around the control.
  assert.doesNotMatch(settings, /settings-nav-top[^>]*overflow/);
  assert.match(settings, /<TooltipButton\s[\s\S]{0,200}?className="settings-tier-swap no-drag"/);
  assert.match(settings, /tooltip=\{layoutSwapLabel\}/);
  assert.match(settings, /ariaLabel=\{layoutSwapLabel\}/);
  assert.match(settings, /<IconLayoutSwap size=\{16\} \/>/);
  assert.match(settings, /saveSettings\(\{ settingsLayout: nextSettingsLayout \}\)/);
  // The tooltip names the tier the press lands on, using the tier's own words.
  assert.match(settings, /layoutTierLabels\[nextSettingsLayout\]/);
  assert.match(settings, /const nextSettingsLayout = nextSettingsTier\(settingsLayout\);/);
  assert.match(tierSource, /tier === "compact" \? "full" : "compact"/);
  // A segmented control needs two labels in a band built for one icon.
  assert.doesNotMatch(settings, /settings-layout-tier/);
  // The supplied glyph is authored with a literal black fill; the theme owns
  // the color, otherwise the control vanishes on the dark theme.
  assert.match(iconsSource, /viewBox="0 0 1024 1024"\s*\n\s*fill="currentColor"/);

  // The compact panel carries its own close control at the band's opposite
  // edge; the full tier leaves that corner to the native caption buttons, so a
  // second X would duplicate the window's own close button.
  const closeIndex = settings.indexOf('className="settings-close no-drag"');
  assert.ok(closeIndex >= 0, "settings close control missing");
  assert.match(
    settings,
    /settingsLayout === "compact" \? \(\s*<TooltipButton[\s\S]{0,300}?className="settings-close no-drag"/,
  );
  assert.equal(
    settings.match(/className="settings-close no-drag"/g)?.length,
    1,
    "the close control must be rendered once, behind the compact condition",
  );
  assert.match(settings, /<IconClose size=\{16\} \/>/);
  assert.match(settings, /tooltip=\{t\("common\.close"\)\}/);
  assert.match(settings, /ariaLabel=\{t\("common\.close"\)\}/);
  assert.match(
    settings,
    /className="settings-close no-drag"[\s\S]{0,400}?onClick=\{\(\) => setPage\("chat"\)\}/,
  );
});

test("the band's controls share chrome geometry and clear native buttons", () => {
  const swapRule = cssRuleIn(settingsCss, ".settings-tier-swap");
  assert.match(swapRule, /position:\s*absolute/);
  // Above .settings-titlebar (z-index 10), whose opaque band would bury it.
  assert.match(swapRule, /z-index:\s*11/);
  assert.match(swapRule, /top:\s*calc\(\(var\(--ds-toolbar-height\) - var\(--ds-work-panel-toggle-size\)\) \/ 2\)/);
  assert.match(swapRule, /left:\s*12px/);
  // macOS draws its traffic lights over the full tier's top-left corner, so the
  // swap pays the same lead inset the shell chrome already reads.
  assert.match(
    cssRuleIn(
      settingsCss,
      ':root[data-platform="darwin"] .settings-shell-full .settings-tier-swap',
    ),
    /left:\s*var\(--ds-window-lead-inset\)/,
  );

  const closeRule = cssRuleIn(settingsCss, ".settings-close");
  assert.match(closeRule, /position:\s*absolute/);
  assert.match(closeRule, /z-index:\s*11/);
  assert.match(closeRule, /top:\s*calc\(\(var\(--ds-toolbar-height\) - var\(--ds-work-panel-toggle-size\)\) \/ 2\)/);
  assert.match(closeRule, /right:\s*12px/);

  // One geometry for every chrome icon control, so the seats cannot drift.
  assert.match(chromeCss, /\.settings-tier-swap,\n\.settings-close \{/);
  // The close control is the one that needs hover wash; it sits alone on the
  // band instead of inside an existing group.
  assert.match(
    chromeCss,
    /\.work-panel-maximize:hover:not\(:disabled\),\n\.settings-close:hover:not\(:disabled\) \{/,
  );
  // The close control only exists on the compact panel, which floats inside
  // the window; the full tier has no renderer close control to clear with.
  assert.doesNotMatch(
    chromeCss,
    /\.settings-shell-full \.settings-close \{/,
    "the full tier must not reserve caption clearance for a control it never renders",
  );
  // The centered panel only overlaps that band once the window is narrow
  // enough for it to reach inside the panel, so it clears exactly the overlap.
  assert.match(
    cssRule(
      ':root[data-platform="win32"] .settings-shell-compact .settings-close,\n:root[data-platform="linux"] .settings-shell-compact .settings-close',
    ),
    /right:\s*calc\(12px \+ max\(0px, var\(--ds-window-controls-width\) - \(100vw - var\(--settings-panel-width\)\) \/ 2\)\)/,
  );
});

test("the compact tier restyles one tree instead of duplicating the page", () => {
  // No wrapper element: the rail and content keep their place in the tree, so
  // switching tiers cannot remount a category or reset its scroll container.
  assert.doesNotMatch(settings, /settings-frame/);
  assert.equal(settings.match(/className=\{cx\(\s*"settings-shell",/g)?.length, 1);
  assert.match(settings, /<OverlayBackdrop\s+className="settings-veil"/);
  assert.match(settings, /settingsLayout === "compact" \? \(/);
});

test("the veil returns to the app and never claims the window drag region", () => {
  assert.match(
    settings,
    /onClick=\{\(event\) => \{\s*if \(event\.target === event\.currentTarget\) setPage\("chat"\);/,
  );
  assert.match(cssRule(".settings-veil"), /position:\s*fixed/);
  assert.match(cssRule(".settings-veil"), /inset:\s*0/);
  assert.match(cssRule(".settings-veil"), /background:\s*var\(--ds-scrim\)/);
  assert.doesNotMatch(cssRule(".settings-veil"), /app-region:\s*drag/);
});

test("the compact scrim dims the live app instead of an empty window", () => {
  // The chat tree stays painted under the veil in the compact tier only; the
  // shipped full-window takeover keeps hiding it.
  assert.match(appShellSource, /hidden=\{page === "settings" && !settingsCompact\}/);
  // Visible is not reachable: the tree stays inert to pointer, keyboard and
  // assistive tech, exactly as the full tier hides it from them.
  assert.match(appShellSource, /inert=\{page === "settings" \? true : undefined\}/);
  assert.match(appShellSource, /^\s*settingsCompact,$/m);
  // Body-level portal surfaces (the live-voice pill) belong to the app layer
  // that the veil covers, so they must not float over the panel.
  assert.match(appShellSource, /<PortalVisibilityProvider visible=\{page !== "settings"\}>/);
  // Above every app surface — the shell's own top layer is 200 — and below the
  // 1000+ chrome band so the caption buttons keep working.
  assert.match(cssRule(".settings-veil"), /z-index:\s*400/);
  assert.match(cssRule(".settings-shell-compact"), /z-index:\s*450/);
});

test("the full tier stays the full-window page and compact centers the same box", () => {
  assert.match(cssRule(".settings-shell-compact"), /position:\s*fixed/);
  assert.match(cssRule(".settings-shell-compact"), /inset:\s*0/);
  assert.match(cssRule(".settings-shell-compact"), /margin:\s*auto/);
  assert.match(cssRule(".settings-shell-compact"), /overflow:\s*hidden/);
  assert.match(
    cssRule(".settings-shell-compact"),
    /--settings-panel-width:\s*min\(clamp\(720px, 54vw, 1040px\), calc\(100vw - 48px\)\)/,
  );
  // One width expression: the swap control's native-button clearance reads it.
  assert.match(
    cssRule(".settings-shell-compact"),
    /width:\s*var\(--settings-panel-width\)/,
  );
  assert.match(
    cssRule(".settings-shell-compact"),
    /height:\s*min\(clamp\(480px, 74vh, 880px\), calc\(100vh - 48px\)\)/,
  );
  assert.match(
    cssRule(".settings-shell-compact"),
    /border:\s*1px solid var\(--ds-border-default\)/,
  );
  assert.match(
    cssRule(".settings-shell-compact"),
    /border-radius:\s*var\(--radius-lg-plus\)/,
  );
  assert.match(
    cssRule(".settings-shell-compact"),
    /background:\s*var\(--ds-bg-primary\)/,
  );
  assert.match(
    cssRule(".settings-shell-compact"),
    /box-shadow:\s*var\(--ds-shadow-dialog\)/,
  );
  // The floating panel is the only tier that paints a frame; the shipped page
  // keeps the rules above it untouched.
  assert.doesNotMatch(cssRule(".settings-shell,\n.settings-shell-full"), /border-radius/);
});

test("the compact tier reclaims the chrome clearance it no longer needs", () => {
  // The panel is not at the window edge, so the rail drops the traffic-light
  // inset and the drag band inside the panel owns the top strip instead.
  assert.match(
    cssRule(".settings-shell-compact .settings-nav-top"),
    /padding:\s*var\(--ds-toolbar-height\) 12px 6px/,
  );
  assert.match(
    cssRule(".settings-shell-compact .settings-content"),
    /padding:\s*calc\(var\(--ds-toolbar-height\) \+ 8px\) 28px 40px 24px/,
  );
  assert.match(
    cssRule(".app-shell:has(.settings-shell-compact) > .window-controls"),
    /background:\s*transparent/,
  );
  // The plugin-theme palette guard forbids a `.window-controls` rule in the
  // Settings sheet, so the band override must live in chrome.css with the band.
  assert.doesNotMatch(settingsCss, /\.window-controls\s*\{/);
  // The rail carries no tier UI after the swap moved into the top-left band.
  assert.doesNotMatch(settingsCss, /settings-layout-tier/);
});

test("macOS vibrancy does not punch the panel out of the compact tier", () => {
  // chrome.css zeroes .settings-shell on darwin; the floating panel owns a
  // surface here, and only the veil keeps the scrim.
  assert.match(
    cssRule(':root[data-platform="darwin"] .settings-shell.settings-shell-compact'),
    /background:\s*var\(--ds-bg-primary\)/,
  );
});

test("every shipped catalog localizes the tier swap", () => {
  // The swap tooltip is the only surface these strings reach, so a missing one
  // would fall through to the raw key inside a sentence.
  for (const locale of ["en", "zh-CN", "zh-TW", "de", "es", "fr", "ko", "pt-BR", "tr"]) {
    const source = readFileSync(
      new URL(`../../../packages/i18n/src/locales/${locale}/index.ts`, import.meta.url),
      "utf8",
    );
    for (const key of [
      "layoutFull",
      "layoutCompact",
      "layoutSwitch",
    ]) {
      assert.match(source, new RegExp(`"?${key}"?:\\s*"`), `${locale} settings.${key}`);
    }
  }
});
