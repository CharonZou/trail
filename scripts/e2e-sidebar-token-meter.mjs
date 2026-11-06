#!/usr/bin/env node
/**
 * Sidebar token meter layout in real Chromium with the built app's own CSS
 * (E2E-UI-sidebar-token-meter).
 *
 * The meter ships a one-year day strip inside a sidebar the user can drag
 * between 240 and 520 CSS px, so the strip's legibility is a layout question,
 * not a unit-test question: at the narrow bound 53 week columns compete with
 * their own gutters. This check loads the packaged stylesheet, renders the same
 * markup TokenUsageCard produces, and measures the result in an Electron
 * renderer at every sidebar bound.
 *
 * Set PI_E2E_ARTIFACT_DIR to also write one PNG per width for a human look.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronBinary } from "./e2e/boot.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { electronBinary } = resolveElectronBinary(root);
const temp = await mkdtemp(join(tmpdir(), "trail-token-meter-"));

/** `SIDEBAR_WIDTH_MIN` / `_DEFAULT` / `_MAX` from lib/sidebar-preferences.ts. */
const SIDEBAR_WIDTHS = [240, 275, 520];
/** One column per ISO week; `buildUsageHeatGrid` can emit up to 53 for a year. */
const WEEK_COLUMNS = 53;

const heatView = () =>
  `<div class="token-usage-heat" role="img" aria-label="53 active weeks">` +
  Array.from({ length: WEEK_COLUMNS }, (_, week) =>
    `<div class="token-usage-heat-week">` +
    Array.from({ length: 7 }, (_, day) => {
      const level = (week + day) % 5;
      return `<span class="token-usage-heat-cell level-${level}"></span>`;
    }).join("") +
    `</div>`,
  ).join("") +
  `</div>`;

const modelView = () =>
  `<ul class="token-usage-models">` +
  [
    ["anthropic/claude-opus", "1.2M", "62%", "100%"],
    ["openai/gpt-5.2-codex", "540.1K", "28%", "45%"],
    ["local/qwen3-coder", "120.4K", "6%", "10%"],
  ].map(
    ([key, total, share, fill]) =>
      `<li class="token-usage-model">` +
      `<span class="token-usage-model-name">${key}</span>` +
      `<span class="token-usage-model-bar" aria-hidden><span class="token-usage-model-bar-fill" style="width:${fill}"></span></span>` +
      `<span class="token-usage-model-total">${total}</span>` +
      `<span class="token-usage-model-share">${share}</span>` +
      `</li>`,
  ).join("") +
  `<li class="token-usage-model is-other">` +
  `<span class="token-usage-model-name">2 other models</span>` +
  `<span class="token-usage-model-bar" aria-hidden><span class="token-usage-model-bar-fill" style="width:4%"></span></span>` +
  `<span class="token-usage-model-total">18.2K</span>` +
  `<span class="token-usage-model-share">1%</span>` +
  `</li></ul>`;

const card = (view) =>
  `<section class="token-usage-card" aria-label="Token usage">` +
  `<div class="token-usage-head"><span class="token-usage-title">Token usage</span>` +
  `<div class="token-usage-switch" role="group" aria-label="Usage view">` +
  `<button type="button" class="token-usage-switch-option active" aria-pressed="true">Calendar</button>` +
  `<button type="button" class="token-usage-switch-option" aria-pressed="false">Models</button>` +
  `</div></div>` +
  `<p class="token-usage-total"><span class="token-usage-total-value">906.4K</span>` +
  `<span class="token-usage-total-unit">tokens</span>` +
  `<span class="token-usage-total-range">Last 12 months</span></p>` +
  view +
  `</section>`;

const probe = `(() => {
  const measure = (sidebarWidth) => {
    const shell = document.querySelector('[data-sidebar-width="' + sidebarWidth + '"]');
    const strip = shell.querySelector('.token-usage-heat');
    const cell = strip.querySelector('.token-usage-heat-cell');
    const week = strip.querySelector('.token-usage-heat-week');
    const card = shell.querySelector('.token-usage-card');
    const stripBox = strip.getBoundingClientRect();
    const cellBox = cell.getBoundingClientRect();
    const weekBox = week.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0;
    const modelShell = document.querySelector('[data-sidebar-width="' + sidebarWidth + '"].is-models');
    const bar = modelShell.querySelector('.token-usage-model-bar');
    const fill = bar.querySelector('.token-usage-model-bar-fill');
    return {
      sidebarWidth,
      cardOverflow: card.scrollWidth - card.clientWidth,
      stripVisibleWidth: Math.round(stripBox.width * 100) / 100,
      stripScrollWidth: Math.round(strip.scrollWidth),
      // The grid's own height, excluding whatever the scrollbar reserves, so
      // the sidebar bounds are compared on the cells rather than on the lane.
      stripContentHeight: Math.round(strip.clientHeight),
      // A classic Windows scrollbar reserves a wide lane; the renderer's shared
      // quiet scrollbar reserves 6px (base.css sizes ::-webkit-scrollbar), and
      // nothing at all when the strip does not overflow.
      scrollbarLane: strip.offsetHeight - strip.clientHeight,
      cellWidth: Math.round(cellBox.width * 100) / 100,
      cellHeight: Math.round(cellBox.height * 100) / 100,
      columnWidth: Math.round(weekBox.width * 100) / 100,
      gap,
      columns: strip.children.length,
      shellHeight: Math.round(shell.getBoundingClientRect().height),
      barWidth: Math.round(bar.getBoundingClientRect().width * 100) / 100,
      fillWidth: Math.round(fill.getBoundingClientRect().width * 100) / 100,
      modelRows: modelShell.querySelectorAll('.token-usage-model').length,
    };
  };
  return [${SIDEBAR_WIDTHS.map((width) => `measure("${width}")`).join(", ")}];
})()`;

await writeFile(
  join(temp, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Sidebar token meter</title>
<style>
  /* Sidebar chrome that the meter does not own: the surface and the column the
     card is dropped into, at the exact width the resize handle would clamp to. */
  :root { color-scheme: light; }
  body { margin: 0; background: var(--ds-bg, #fff); }
  .meter-shell { display: flex; flex-direction: column; height: 520px; }
  .meter-scroll { flex: 1 1 auto; overflow: hidden; }
</style>
${SIDEBAR_WIDTHS.map(
  (width) =>
    `<div class="sidebar sidebar-surface meter-shell is-calendar" data-sidebar-width="${width}" style="width:${width}px">` +
    `<div class="meter-scroll">${card(heatView())}</div>` +
    `<div class="sidebar-footer no-drag"></div></div>` +
    `<div class="sidebar sidebar-surface meter-shell is-models" data-sidebar-width="${width}" style="width:${width}px">` +
    `<div class="meter-scroll">${card(modelView())}</div>` +
    `<div class="sidebar-footer no-drag"></div></div>`,
).join("")}`,
);

// The stylesheet comes from the built renderer so tokens, the Tailwind preflight
// and the meter partial all cascade exactly as they do in the app.
const renderer = join(root, "apps", "desktop", "out", "renderer");
const appHtml = await readFile(join(renderer, "index.html"), "utf8");
const cssLinks = [...appHtml.matchAll(/href="([^" ]+\.css)"/g)].map((match) => match[1]);
assert.ok(cssLinks.length, "Build the app with pnpm --filter @trail/desktop build first");
await cp(join(renderer, "assets"), join(temp, "assets"), { recursive: true });
const html = await readFile(join(temp, "index.html"), "utf8");
await writeFile(
  join(temp, "index.html"),
  html.replace(
    "<title>Sidebar token meter</title>",
    `<title>Sidebar token meter</title>${cssLinks.map((path) => `<link rel="stylesheet" href="${path}">`).join("")}`,
  ),
);

await writeFile(
  join(temp, "main.cjs"),
  `
const { app, BrowserWindow } = require("electron");
app.setPath("userData", require("node:path").join(__dirname, "profile"));
app.whenReady().then(async () => {
  // A hidden window paints nothing for capturePage, and showing one on a user's
  // desktop is not a test's business, so PNG artifacts run through Chromium's
  // offscreen compositor instead.
  const offscreen = Boolean(process.env.PI_E2E_ARTIFACT_DIR);
  const window = new BrowserWindow({
    show: false, width: 1100, height: 720,
    webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen },
  });
  window.webContents.on("console-message", (event) => console.error(event.message));
  let step = "launch";
  const warnings = [];
  try {
    await window.loadFile(require("node:path").join(__dirname, "index.html"));
    if (offscreen) {
      await new Promise((resolve) => window.webContents.once("paint", resolve));
    }
    // Font metrics move the meter's numbers, and therefore the strip, so the
    // first paint after the bundled faces settle is the one worth measuring.
    step = "fonts";
    await window.webContents.executeJavaScript("document.fonts.ready.then(() => 1)");
    step = "probe";
    const measure = await window.webContents.executeJavaScript(${JSON.stringify(probe)});
    if (offscreen) {
      step = "artifacts";
      const fs = require("node:fs");
      fs.mkdirSync(process.env.PI_E2E_ARTIFACT_DIR, { recursive: true });
      for (const width of ${JSON.stringify(SIDEBAR_WIDTHS.map(String))}) {
        try {
          await window.webContents.executeJavaScript(
            "(() => { const wanted = " + JSON.stringify(String(width)) + ";" +
            "for (const shell of document.querySelectorAll('.meter-shell'))" +
            "shell.style.display = shell.dataset.sidebarWidth === wanted ? 'flex' : 'none';" +
            "document.body.style.width = wanted + 'px'; return 1; })()"
          );
          await new Promise((resolve) => window.webContents.once("paint", resolve));
          fs.writeFileSync(
            require("node:path").join(process.env.PI_E2E_ARTIFACT_DIR, "token-meter-" + width + ".png"),
            (await window.webContents.capturePage()).toPNG(),
          );
        } catch (captureError) {
          // The measurements are the gate; a PNG is a human convenience and a
          // machine without a compositor for the capture must not fail it.
          warnings.push("png " + width + ": " + String(captureError && captureError.message || captureError));
        }
      }
    }
    console.log("REPORT" + JSON.stringify({ measure, warnings }));
  } catch (error) {
    console.log("REPORT" + JSON.stringify({ error: step + ": " + String(error && error.stack || error) }));
  } finally {
    app.exit(0);
  }
});
`,
);

const output = await new Promise((resolve, reject) => {
  const child = spawn(electronBinary, [join(temp, "main.cjs")], {
    cwd: root,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.once("error", reject);
  child.once("exit", (code) => resolve({ code, stdout, stderr }));
});

try {
  const line = output.stdout.split("\n").find((entry) => entry.startsWith("REPORT"));
  assert.ok(line, `renderer probe produced no report (exit ${output.code}):\n${output.stderr}`);
  const report = JSON.parse(line.slice("REPORT".length));
  assert.ok(!report.error, `renderer probe failed:\n${report.error}`);
  for (const warning of report.warnings ?? []) console.warn(warning);

  for (const row of report.measure) {
    console.log(
      `${row.sidebarWidth}px sidebar: cell ${row.cellWidth}x${row.cellHeight}px, ` +
        `${row.columns} columns of ${row.columnWidth}px + ${row.gap}px gutter, ` +
        `strip ${row.stripVisibleWidth}px visible of ${row.stripScrollWidth}px, ` +
        `grid ${row.stripContentHeight}px tall, card overflow ${row.cardOverflow}, scrollbar lane ${row.scrollbarLane}`,
    );
  }

  for (const row of report.measure) {
    // Below ~5 CSS px a tinted square stops reading as a cell: the gutter
    // between columns becomes wider than the column itself, and a year of
    // history degrades into a dot field.
    assert.ok(
      row.cellWidth >= 5,
      `${row.sidebarWidth}px sidebar: heat cell is ${row.cellWidth}px wide (needs >= 5px)`,
    );
    assert.ok(
      Math.abs(row.cellHeight - row.cellWidth) < 0.6,
      `${row.sidebarWidth}px sidebar: cell is ${row.cellWidth}x${row.cellHeight}, not square`,
    );
    assert.equal(row.columns, WEEK_COLUMNS, `${row.sidebarWidth}px sidebar: column count`);
    assert.ok(row.cardOverflow <= 0, `${row.sidebarWidth}px sidebar: the card overflows its shell`);
    assert.ok(
      row.scrollbarLane === 0 || row.scrollbarLane === 6,
      `${row.sidebarWidth}px sidebar: scrollbar lane is ${row.scrollbarLane}px, expected the shared 6px quiet scrollbar or none`,
    );
    assert.ok(
      row.stripScrollWidth >= row.stripVisibleWidth,
      `${row.sidebarWidth}px sidebar: the strip is clipped instead of scrollable`,
    );
    assert.ok(row.fillWidth <= row.barWidth + 0.5, `${row.sidebarWidth}px sidebar: the bar fill escapes the track`);
    assert.equal(row.modelRows, 4, `${row.sidebarWidth}px sidebar: model rows`);
  }

  const heights = report.measure.map((row) => row.stripContentHeight);
  assert.ok(
    Math.max(...heights) - Math.min(...heights) <= 4,
    `the heat grid changes height with the sidebar: ${heights.join("px / ")}px`,
  );
  console.log(`E2E-UI-sidebar-token-meter OK (grid ${heights.join(" / ")}px across sidebar bounds)`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
