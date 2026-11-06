#!/usr/bin/env node
/**
 * Empty-home token meter layout in real Chromium with the built app's own CSS
 * (E2E-UI-home-token-meter).
 *
 * The meter sits under the empty-home hero, inside the centered chat band, so
 * its legibility is a layout question the renderer answers, not a unit test:
 * the band has a 560px preference floor but a squeezed pane still draws it
 * narrower, where 53 week columns start competing with their own gutters, and
 * a maximized pane widens it past the card's own cap. This check loads the
 * packaged stylesheet, renders the same stack ChatSurface builds for a project
 * and a temporary session, and measures the result in an Electron renderer at
 * every band width.
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

/**
 * `MIN_CHAT_CONTENT_MAX_WIDTH` / `DEFAULT_CHAT_CONTENT_MAX_WIDTH` from
 * packages/shared/src/chat-content-width.ts, the 1160px a maximized pane lets
 * the drag reach, and 402px = the narrowest live band, where
 * `clampChatContentMaxWidth` returns `paneWidth - 2 * gutter` against
 * `.main-pane`'s 450px floor instead of the 560px preference.
 */
const BAND_WIDTHS = [402, 560, 760, 1160];
/** The hero answers with the project name or the temporary-session phrase. */
const HOME_KINDS = ["project", "temporary"];
/** One column per ISO week; `buildUsageHeatGrid` can emit up to 53 for a year. */
const WEEK_COLUMNS = 53;
/** `.token-usage-card { max-width: 880px }`. */
const CARD_MAX_WIDTH = 880;

const heroTitle = {
  project: "今天想在 Trail 里做点什么？",
  temporary: "临时聊点什么？",
};

const heatView = () =>
  `<div class="token-usage-heat" role="img" aria-label="53 active weeks" tabindex="0">` +
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
    ["anthropic/claude-opus", "1.2M", "62%", "100"],
    ["openai/gpt-5.2-codex", "540.1K", "28%", "45"],
    ["local/qwen3-coder", "120.4K", "6%", "10"],
  ].map(
    ([key, total, share, fill]) =>
      `<li class="token-usage-model">` +
      `<span class="token-usage-model-name">${key}</span>` +
      `<span class="token-usage-model-bar" aria-hidden><span class="token-usage-model-bar-fill" style="width:${fill}%"></span></span>` +
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
  (view === "calendar" ? heatView() : modelView()) +
  `</section>`;

// The home stack as ChatSurface builds it: hero, first-run list position, meter,
// then the composer kept outside the scroll. The band is the custom property the
// drag handles write on `.main-pane`.
const home = (bandWidth, kind, view) =>
  `<div class="home-main-content meter-home" data-band-width="${bandWidth}" data-home-session-kind="${kind}" data-view="${view}" style="--chat-content-max-width:${bandWidth}px;--chat-composer-max-width:${bandWidth}px">` +
  `<div class="home-scroll"><div class="home-stack-inner">` +
  `<div class="empty-hero"><div class="empty-hero-icon" aria-hidden="true"></div>` +
  `<h1>${heroTitle[kind]}</h1></div>` +
  card(view) +
  `</div></div>` +
  `<div class="home-composer-wrap"><div class="meter-composer">Composer</div></div>` +
  `</div>`;

const shells = BAND_WIDTHS.flatMap((bandWidth) =>
  HOME_KINDS.flatMap((kind) =>
    ["calendar", "models"].map((view) => home(bandWidth, kind, view)),
  ),
);

const probe = `(() => {
  const round2 = (value) => Math.round(value * 100) / 100;
  const measure = (shell) => {
    const stack = shell.querySelector('.home-stack-inner');
    const hero = shell.querySelector('.empty-hero');
    const card = shell.querySelector('.token-usage-card');
    const composer = shell.querySelector('.home-composer-wrap');
    const cardBox = card.getBoundingClientRect();
    const stackBox = stack.getBoundingClientRect();
    const heroBox = hero.getBoundingClientRect();
    const row = {
      bandWidth: Number(shell.dataset.bandWidth),
      kind: shell.dataset.homeSessionKind,
      view: shell.dataset.view,
      cardWidth: round2(cardBox.width),
      cardHeight: Math.round(cardBox.height),
      cardCenterOffset: round2(
        (cardBox.left + cardBox.width / 2) - (stackBox.left + stackBox.width / 2)),
      // Negative once the card is stacked above the hero instead of below it.
      heroGap: Math.round(cardBox.top >= heroBox.bottom
        ? cardBox.top - heroBox.bottom : cardBox.bottom - heroBox.top),
      composerGap: Math.round(composer.getBoundingClientRect().top - cardBox.bottom),
      cardOverflow: card.scrollWidth - card.clientWidth,
    };
    const strip = card.querySelector('.token-usage-heat');
    if (strip) {
      const cell = strip.querySelector('.token-usage-heat-cell');
      const week = strip.querySelector('.token-usage-heat-week');
      row.cellWidth = round2(cell.getBoundingClientRect().width);
      row.cellHeight = round2(cell.getBoundingClientRect().height);
      row.columnWidth = round2(week.getBoundingClientRect().width);
      row.gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0;
      row.columns = strip.children.length;
      row.stripVisibleWidth = round2(strip.getBoundingClientRect().width);
      row.stripScrollWidth = Math.round(strip.scrollWidth);
      // The grid's own height, excluding whatever the scrollbar reserves, so
      // the band bounds are compared on the cells rather than on the lane.
      row.stripContentHeight = Math.round(strip.clientHeight);
      // A classic Windows scrollbar reserves a wide lane; the renderer's shared
      // quiet scrollbar reserves 6px (base.css sizes ::-webkit-scrollbar), and
      // nothing at all when the strip does not overflow.
      row.scrollbarLane = strip.offsetHeight - strip.clientHeight;
    }
    const bar = card.querySelector('.token-usage-model-bar');
    if (bar) {
      const fill = bar.querySelector('.token-usage-model-bar-fill');
      row.barWidth = round2(bar.getBoundingClientRect().width);
      row.fillWidth = round2(fill.getBoundingClientRect().width);
      row.modelRows = card.querySelectorAll('.token-usage-model').length;
    }
    return row;
  };
  return Array.from(document.querySelectorAll('.meter-home')).map(measure);
})()`;

await writeFile(
  join(temp, "index.html"),
  `<!doctype html><html data-theme="dark"><meta charset="utf-8"><title>Empty-home token meter</title>
<style>
  /* Home chrome the meter does not own: the pane height the app boots at and
     the composer box that must stay below the card. The theme tokens come from
     the packaged sheet, so the fixture never restates a color. */
  body { margin: 0; background: var(--ds-bg-primary); color: var(--ds-text-primary); }
  .meter-home { height: 620px; }
  .meter-composer { height: 84px; background: var(--ds-bg-composer); border: 1px solid var(--ds-border-subtle); }
</style>
${shells.join("")}`,
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
    "<title>Empty-home token meter</title>",
    `<title>Empty-home token meter</title>${cssLinks.map((path) => `<link rel="stylesheet" href="${path}">`).join("")}`,
  ),
);

// One shot per band for a project's calendar hero and a temporary session's
// model ranking, so both hero variants and both views get looked at, plus the
// light theme on the default band.
const captures = [
  ...BAND_WIDTHS.flatMap((bandWidth) => [
    { bandWidth, kind: "project", view: "calendar", theme: "dark" },
    { bandWidth, kind: "temporary", view: "models", theme: "dark" },
  ]),
  { bandWidth: 760, kind: "project", view: "calendar", theme: "light" },
  { bandWidth: 402, kind: "temporary", view: "models", theme: "light" },
];

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
      for (const target of ${JSON.stringify(captures)}) {
        const name = "token-meter-" + target.bandWidth + "-" + target.kind + "-" + target.view + "-" + target.theme;
        try {
          await window.webContents.executeJavaScript(
            "(() => { for (const shell of document.querySelectorAll('.meter-home'))" +
            "shell.style.display = (shell.dataset.bandWidth === '" + String(target.bandWidth) + "'" +
            " && shell.dataset.homeSessionKind === '" + target.kind + "'" +
            " && shell.dataset.view === '" + target.view + "') ? 'flex' : 'none';" +
            "document.documentElement.dataset.theme = '" + target.theme + "';" +
            "document.body.style.width = '" + target.bandWidth + "px'; return 1; })()"
          );
          await new Promise((resolve) => window.webContents.once("paint", resolve));
          fs.writeFileSync(
            require("node:path").join(process.env.PI_E2E_ARTIFACT_DIR, name + ".png"),
            (await window.webContents.capturePage()).toPNG(),
          );
        } catch (captureError) {
          // The measurements are the gate; a PNG is a human convenience and a
          // machine without a compositor for the capture must not fail it.
          warnings.push("png " + name + ": " + String(captureError && captureError.message || captureError));
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

const label = (row) => `${row.bandWidth}px band / ${row.kind} / ${row.view}`;

try {
  const line = output.stdout.split("\n").find((entry) => entry.startsWith("REPORT"));
  assert.ok(line, `renderer probe produced no report (exit ${output.code}):\n${output.stderr}`);
  const report = JSON.parse(line.slice("REPORT".length));
  assert.ok(!report.error, `renderer probe failed:\n${report.error}`);
  for (const warning of report.warnings ?? []) console.warn(warning);
  assert.equal(
    report.measure.length,
    BAND_WIDTHS.length * HOME_KINDS.length * 2,
    "the home fixture lost a shell",
  );

  for (const row of report.measure) {
    console.log(
      `${label(row)}: card ${row.cardWidth}x${row.cardHeight}px at ${row.cardCenterOffset >= 0 ? "+" : ""}${row.cardCenterOffset}px of center, ` +
        `${row.heroGap}px below the hero, ${row.composerGap}px above the composer, card overflow ${row.cardOverflow}` +
        (row.cellWidth === undefined
          ? `, ${row.modelRows} model rows, bar ${row.barWidth}px filled to ${row.fillWidth}px`
          : `, cell ${row.cellWidth}x${row.cellHeight}px, ${row.columns} columns of ${row.columnWidth}px + ${row.gap}px gutter, ` +
            `strip ${row.stripVisibleWidth}px visible of ${row.stripScrollWidth}px, grid ${row.stripContentHeight}px tall, scrollbar lane ${row.scrollbarLane}`),
    );
  }

  for (const row of report.measure) {
    assert.ok(
      row.heroGap >= 0,
      `${label(row)}: the meter is not under the hero (heroGap ${row.heroGap})`,
    );
    assert.ok(
      row.composerGap > 0,
      `${label(row)}: the meter overlaps the composer (composerGap ${row.composerGap})`,
    );
    assert.ok(row.cardOverflow <= 0, `${label(row)}: the card overflows the home stack`);
    assert.ok(
      Math.abs(row.cardCenterOffset) < 1,
      `${label(row)}: the card sits ${row.cardCenterOffset}px off the centered band`,
    );
    assert.ok(
      row.cardWidth <= CARD_MAX_WIDTH + 0.5,
      `${label(row)}: the card is ${row.cardWidth}px wide, past its ${CARD_MAX_WIDTH}px cap`,
    );
    if (row.cellWidth !== undefined) {
      // Below ~5 CSS px a tinted square stops reading as a cell: the gutter
      // between columns becomes wider than the column itself, and a year of
      // history degrades into a dot field.
      assert.ok(
        row.cellWidth >= 5,
        `${label(row)}: heat cell is ${row.cellWidth}px wide (needs >= 5px)`,
      );
      assert.ok(
        Math.abs(row.cellHeight - row.cellWidth) < 0.6,
        `${label(row)}: cell is ${row.cellWidth}x${row.cellHeight}, not square`,
      );
      assert.equal(row.columns, WEEK_COLUMNS, `${label(row)}: column count`);
      assert.ok(
        row.scrollbarLane === 0 || row.scrollbarLane === 6,
        `${label(row)}: scrollbar lane is ${row.scrollbarLane}px, expected the shared 6px quiet scrollbar or none`,
      );
      assert.ok(
        row.stripScrollWidth >= row.stripVisibleWidth,
        `${label(row)}: the strip is clipped instead of scrollable`,
      );
      // The grid follows the card's width, so a wide band must not turn a year
      // of history into a block of tiles taller than the hero above it.
      assert.ok(
        row.stripContentHeight <= 120,
        `${label(row)}: the heat grid is ${row.stripContentHeight}px tall`,
      );
    }
    if (row.modelRows !== undefined) {
      assert.ok(
        row.fillWidth <= row.barWidth + 0.5,
        `${label(row)}: the bar fill escapes the track`,
      );
      assert.equal(row.modelRows, 4, `${label(row)}: model rows`);
    }
  }

  const widest = report.measure.find(
    (row) => row.bandWidth === BAND_WIDTHS.at(-1) && row.view === "calendar",
  );
  assert.ok(
    Math.abs(widest.cardWidth - CARD_MAX_WIDTH) < 1,
    `a maximized band should hit the card cap, saw ${widest.cardWidth}px`,
  );

  const narrowest = report.measure.find(
    (row) => row.bandWidth === BAND_WIDTHS[0] && row.view === "calendar",
  );
  assert.ok(
    narrowest.stripScrollWidth > narrowest.stripVisibleWidth,
    `the narrow band does not overflow, so the ${narrowest.columnWidth}px column floor is untested`,
  );

  const cells = report.measure
    .filter((row) => row.cellWidth !== undefined)
    .map((row) => row.cellWidth);
  console.log(
    `E2E-UI-home-token-meter OK (cell ${Math.min(...cells)}–${Math.max(...cells)}px across band bounds, ` +
      `card capped at ${CARD_MAX_WIDTH}px under both heroes)`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
