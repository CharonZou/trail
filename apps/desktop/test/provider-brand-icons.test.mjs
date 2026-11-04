/**
 * Which AI service leads its tile with a brand mark (D625).
 *
 * The mapping is keyed by identifiers, never by the displayed label: labels are
 * localized, so "OpenAI" and "开源AI"-ish renderings must land on the same mark
 * and an unknown service must keep its letter. These tests pin the identity
 * rules — including the places where one company's entry points share a mark and
 * where two marks of the same company differ on purpose — and the shape of the
 * glyph data the tile paints.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  brandGlyphForNamedService,
  brandGlyphForOAuthVendor,
  brandGlyphForProvider,
} from "../src/components/settings/provider-brand-icons.ts";

const chooserSource = await readFile(
  new URL("../src/components/settings/ServiceChooser.tsx", import.meta.url),
  "utf8",
);
const rowSource = await readFile(
  new URL("../src/components/settings/ServiceRow.tsx", import.meta.url),
  "utf8",
);
const monogramSource = await readFile(
  new URL("../src/components/settings/ServiceMonogram.tsx", import.meta.url),
  "utf8",
);
const tokensSource = await readFile(
  new URL("../src/styles/tokens.css", import.meta.url),
  "utf8",
);

const provider = (over = {}) => ({
  id: "p1",
  name: "OpenAI",
  vendorKey: "openai",
  type: "native",
  protocol: "responses",
  enabled: true,
  baseUrl: "https://api.openai.com/v1",
  authKind: "api_key",
  hasSecret: true,
  models: [],
  supportsReasoning: false,
  supportedThinkingLevels: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

/** Marks are told apart by their first path, which is unique per brand. */
const firstPath = (glyph) => glyph.paths[0].d.slice(0, 24);

/** Every preset id that carries a mark, and the brand it carries. */
const NAMED_MARKS = {
  openai: "openai",
  anthropic: "anthropic",
  google: "gemini",
  deepseek: "deepseek",
  meta: "meta",
  volcengine: "volcengine",
  zai: "zai",
  "zai-coding-plan": "zai",
  zhipuai: "zai",
  "zhipuai-coding-plan": "zai",
  xai: "grok",
  openrouter: "openrouter",
  "alibaba-cn": "qwen",
  "alibaba-token-plan": "qwen",
  "alibaba-token-plan-cn": "qwen",
  xiaomi: "xiaomi",
  "xiaomi-token-plan-cn": "xiaomi",
  "xiaomi-token-plan-ams": "xiaomi",
  "xiaomi-token-plan-sgp": "xiaomi",
};

test("named presets with a known mark resolve it by preset id", () => {
  for (const id of Object.keys(NAMED_MARKS)) {
    const glyph = brandGlyphForNamedService(id);
    assert.ok(glyph, `${id} should carry a mark`);
    assert.match(glyph.viewBox, /^\d*\.?\d+ \d*\.?\d+ \d*\.?\d+ \d*\.?\d+$/, id);
    assert.ok(glyph.paths.length > 0, id);
  }
});

test("one company's entry points share one mark", () => {
  // Zhipu and Z.AI are one company's two doors; the Qwen entries are Alibaba's
  // and the Xiaomi token plans are Xiaomi's. xAI leads with Grok's mark.
  const families = [
    ["zai", "zai-coding-plan", "zhipuai", "zhipuai-coding-plan"],
    ["alibaba-cn", "alibaba-token-plan", "alibaba-token-plan-cn"],
    ["xiaomi", "xiaomi-token-plan-cn", "xiaomi-token-plan-ams", "xiaomi-token-plan-sgp"],
  ];
  for (const family of families) {
    const marks = family.map((id) => brandGlyphForNamedService(id));
    assert.ok(marks.every(Boolean), family.join(" / "));
    for (const [index, glyph] of marks.slice(1).entries()) {
      assert.equal(firstPath(glyph), firstPath(marks[0]), family[index + 1]);
      assert.equal(glyph.viewBox, marks[0].viewBox, family[index + 1]);
    }
  }
  assert.equal(firstPath(brandGlyphForNamedService("xai")), firstPath(brandGlyphForOAuthVendor("xai")));
});

test("a service with no mark keeps its letter tile", () => {
  for (const id of [
    "groq",
    "mistral",
    "minimax",
    "kimi-for-coding",
    // The two chooser entries that are not a preset at all.
    "custom",
    "jev",
    // Plugin-contributed providers carry the plugin's identity, not a brand.
    "plugin:example:provider",
    "",
  ]) {
    assert.equal(brandGlyphForNamedService(id), undefined, id);
  }
});

test("Claude signs in as Anthropic but leads with its own mark", () => {
  const claude = brandGlyphForOAuthVendor("anthropic");
  const anthropic = brandGlyphForNamedService("anthropic");
  assert.ok(claude && anthropic);
  assert.notEqual(firstPath(claude), firstPath(anthropic));
  // A vendor that is the same service as a preset leads with the same mark.
  for (const [vendorId, presetId] of [
    ["openai", "openai"],
    ["openai-codex", "openai"],
    ["meta", "meta"],
    ["xai", "xai"],
    ["openrouter", "openrouter"],
  ]) {
    assert.equal(
      firstPath(brandGlyphForOAuthVendor(vendorId)),
      firstPath(brandGlyphForNamedService(presetId)),
      vendorId,
    );
  }
  // Copilot has no artwork of its own here, so it signs in as GitHub.
  const copilot = brandGlyphForOAuthVendor("github-copilot");
  assert.ok(copilot);
  assert.equal(copilot.paths[0].fill, "currentColor");
  for (const other of ["anthropic", "openai", "meta", "xai", "openrouter"]) {
    assert.notEqual(firstPath(copilot), firstPath(brandGlyphForOAuthVendor(other)), other);
  }
  // Vendors without a mark in this build stay lettered.
  for (const vendorId of ["kimi-coding", "radius"]) {
    assert.equal(brandGlyphForOAuthVendor(vendorId), undefined, vendorId);
  }
});

test("a stored row resolves its mark from the identifiers the row carries", () => {
  // An API-key row matches the same preset the chooser offered.
  assert.equal(
    firstPath(brandGlyphForProvider(provider())),
    firstPath(brandGlyphForNamedService("openai")),
  );
  // A coding-plan row is told apart by its URL, so it must not share a mark it
  // has no claim to: only the Zhipu family resolves to Z.ai.
  assert.equal(
    firstPath(
      brandGlyphForProvider(
        provider({ vendorKey: "zhipuai", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }),
      ),
    ),
    firstPath(brandGlyphForNamedService("zhipuai")),
  );
  assert.equal(
    brandGlyphForProvider(provider({ vendorKey: "groq", baseUrl: "https://api.groq.com/openai/v1" })),
    undefined,
  );
  // A token-plan row is a different door of the same company, so it leads with
  // that company's mark rather than a letter.
  assert.equal(
    firstPath(
      brandGlyphForProvider(
        provider({
          vendorKey: "xiaomi-token-plan-cn",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
        }),
      ),
    ),
    firstPath(brandGlyphForNamedService("xiaomi")),
  );
  // A custom endpoint matches no preset and stays lettered.
  assert.equal(
    brandGlyphForProvider(
      provider({ vendorKey: "custom", type: "custom", baseUrl: "https://llm.example.test/v1" }),
    ),
    undefined,
  );
  // A signed-in account row leads with its vendor's mark, Claude included.
  const account = brandGlyphForProvider(
    provider({ vendorKey: "anthropic", authKind: "oauth", baseUrl: undefined, hasOauth: true }),
  );
  assert.equal(firstPath(account), firstPath(brandGlyphForOAuthVendor("anthropic")));
  // A plugin-owned row never takes a first-party mark, even on a first-party URL.
  assert.equal(
    brandGlyphForProvider(provider({ ownerPluginId: "example" })),
    undefined,
  );
});

test("every mark in the table paints", () => {
  const seen = new Set();
  for (const id of Object.keys(NAMED_MARKS)) {
    const glyph = brandGlyphForNamedService(id);
    assert.ok(glyph, id);
    assert.ok(glyph.paths.length > 0, id);
    const gradientIds = new Set((glyph.gradients ?? []).map((gradient) => gradient.id));
    for (const path of glyph.paths) {
      assert.match(path.d, /^[ML]/, `${id} path data`);
      if (path.gradient) assert.ok(gradientIds.has(path.gradient), `${id} -> ${path.gradient}`);
      // A paint is the tile's ink, a literal brand colour, or one theme token.
      else assert.match(
        path.fill ?? "",
        /^(currentColor|#[\da-f]{3,8}|var\(--ds-[a-z-]+, currentColor\))$/i,
        `${id} fill`,
      );
    }
    for (const gradient of glyph.gradients ?? []) {
      assert.ok(gradient.stops.length >= 2, `${id} ${gradient.id}`);
      // Gradient ids are scoped per tile at render, so they must be distinct now.
      assert.ok(!seen.has(gradient.id), `duplicate gradient id ${gradient.id}`);
      seen.add(gradient.id);
    }
  }
});

test("the one themed brand paint is a token both themes define", () => {
  const openrouter = brandGlyphForNamedService("openrouter");
  assert.match(openrouter.paths[0].fill, /^var\(--ds-brand-openrouter/);
  // The token only moves a mark if each built-in theme root actually defines it.
  for (const theme of ["dark", "light"]) {
    const block = tokensSource.match(new RegExp(`:root\\[data-theme="${theme}"\\] \\{[\\s\\S]*?\\n\\}`));
    assert.ok(block, `${theme} theme root is missing`);
    assert.match(block[0], /--ds-brand-openrouter: #[\da-f]{6};/, theme);
  }
  // Xiaomi's mark is the letterform alone: the app icon's own plate would
  // double-stack on the tile's.
  const xiaomi = brandGlyphForNamedService("xiaomi");
  assert.equal(xiaomi.paths.length, 1);
  assert.equal(xiaomi.paths[0].fill, "#ff6900");
});

test("the tile renders a mark and falls back to the letter", () => {
  assert.match(monogramSource, /glyph \? <BrandMark/);
  assert.match(monogramSource, /letter \|\| <IconServer size=\{14\}/);
  // Each tile owns its gradient defs, because ids are document-global.
  assert.match(monogramSource, /useId\(\)/);
  assert.match(monogramSource, /pi-brand-\$\{gradient\.id\}-\$\{scope\}/);
  // Paint goes through `style`, so a themed brand fill resolves; the `fill`
  // attribute would leave a `var(...)` unparsed.
  assert.match(monogramSource, /style=\{\{\s*fill:/);
  assert.doesNotMatch(monogramSource, /^\s+fill=\{/m);
});

test("the chooser and the list lead every service tile with the same resolver", () => {
  assert.match(chooserSource, /glyph=\{brandGlyphForOAuthVendor\(vendor\.vendorId\)\}/);
  assert.match(chooserSource, /glyph=\{brandGlyphForNamedService\(option\.id\)\}/);
  assert.match(rowSource, /glyph=\{brandGlyphForProvider\(provider\)\}/);
  // A plugin's tile and the classifier keep the letter: neither is a first-party
  // brand this table could vouch for.
  const pluginAndClassifier = chooserSource.slice(chooserSource.indexOf("data-plugin-provider-id"));
  assert.equal(pluginAndClassifier.match(/glyph=\{/g), null);
});
