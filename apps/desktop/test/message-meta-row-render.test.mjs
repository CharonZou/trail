import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { catalogs } from "@pi-desktop/i18n";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

/*
 * What the completed turn's meta row actually paints.
 *
 * The row is where the user reads which project answered and how long the turn
 * took, so these assertions run the real component against the real catalogues:
 * a source-text check cannot show that the tile's accessible name, the inline
 * project colour, and the localized duration reach the DOM together, or that an
 * unmeasured turn leaves the duration out.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROJECT_PATH = "/Users/dev/work/apps";

async function withMetaRow(run) {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false },
    esbuild: { jsx: "automatic" },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: "silent",
  });
  try {
    const { MessageMeta } = await server.ssrLoadModule(
      "/src/features/chat/transcript/shared.tsx",
    );
    const { projectColor } = await server.ssrLoadModule(
      "/src/lib/recent-projects.ts",
    );
    const instances = {};
    for (const lng of ["en", "zh-CN"]) {
      const i18n = createInstance();
      await i18n.init({
        lng,
        resources: { [lng]: { translation: catalogs[lng] } },
        fallbackLng: lng,
      });
      instances[lng] = i18n;
    }
    const render = (props, lng = "en") =>
      renderToStaticMarkup(
        createElement(
          I18nextProvider,
          { i18n: instances[lng] },
          createElement(MessageMeta, props),
        ),
      );
    await run({ render, projectColor });
  } finally {
    await server.close();
  }
}

test("a local turn's row names its project and states the whole-turn time", async () => {
  await withMetaRow(({ render, projectColor }) => {
    const html = render({
      modelId: "deepseek-flash",
      projectPath: PROJECT_PATH,
      projectName: "apps",
      turnDurationMs: 80_000,
    });
    assert.match(html, /class="message-meta-project"/);
    assert.match(
      html,
      /aria-label="Project apps"/,
      "the tile is read as the project, not as decoration",
    );
    assert.match(
      html,
      new RegExp(`background:${projectColor(PROJECT_PATH)}`),
      "the tile carries the project's own colour",
    );
    assert.match(html, /deepseek-flash/);
    assert.match(html, /Took 1 min 20 sec/);
    assert.ok(
      html.indexOf("message-meta-project") < html.indexOf("message-meta-chip model"),
      "the tile leads the row",
    );
    assert.ok(
      html.indexOf("message-meta-chip model") <
        html.lastIndexOf("message-meta-chip duration"),
      "the duration closes it",
    );
  });
});

test("the duration reads in the interface language", async () => {
  await withMetaRow(({ render }) => {
    assert.match(
      render(
        { projectPath: PROJECT_PATH, projectName: "应用", turnDurationMs: 3_725_000 },
        "zh-CN",
      ),
      /共用时 1 小时 2 分 5 秒/,
    );
    assert.match(
      render({ projectPath: PROJECT_PATH, projectName: "应用" }, "zh-CN"),
      /项目 应用/,
    );
  });
});

test("an unmeasured turn and a session with no folder each leave their part out", async () => {
  await withMetaRow(({ render }) => {
    const untimed = render({
      modelId: "deepseek-flash",
      projectPath: PROJECT_PATH,
      projectName: "apps",
    });
    assert.doesNotMatch(untimed, /message-meta-chip duration/);
    assert.doesNotMatch(untimed, /Took/, "no invented zero");
    const subSecond = render({
      projectPath: PROJECT_PATH,
      turnDurationMs: 420,
    });
    assert.doesNotMatch(subSecond, /Took/);
    const remote = render({ modelId: "deepseek-flash", turnDurationMs: 5_000 });
    assert.doesNotMatch(remote, /message-meta-project/, "no folder to name");
    assert.match(remote, /Took 5 sec/);
    assert.equal(
      render({ modelId: undefined, projectPath: null }),
      "",
      "a row with nothing to say is not rendered at all",
    );
  });
});
