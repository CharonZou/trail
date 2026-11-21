import { describe, expect, it } from "vitest";
import {
  CHANGELOG,
  formatChangelogNotes,
  getChangelogEntry,
  normalizeChangelogVersion,
  resolveChangelogLocale,
} from "./changelog.js";
import { loadChangelogCatalog } from "./changelog-loader.js";

const STABLE_FROM = "1.0.1";

describe("changelog catalog", () => {
  it("keeps shipped locale version sets and highlight counts aligned", () => {
    const en = CHANGELOG.en;
    const zh = CHANGELOG["zh-CN"];
    for (const catalog of [
      zh,
      CHANGELOG["zh-TW"],
      CHANGELOG.tr,
      CHANGELOG.de,
      CHANGELOG.es,
      CHANGELOG.fr,
      CHANGELOG.ko,
      CHANGELOG["pt-BR"],
    ]) {
      expect(catalog.map((entry) => entry.version)).toEqual(
        en.map((entry) => entry.version),
      );
      for (let index = 0; index < en.length; index += 1) {
        expect(catalog[index]?.highlights.length).toBe(
          en[index]?.highlights.length,
        );
        expect(en[index]?.highlights.length).toBeGreaterThan(0);
      }
    }
  });

  it("lists 1.0.1 through the current release newest-first", () => {
    const versions = CHANGELOG.en.map((entry) => entry.version);
    expect(versions[0]).toBe("1.0.4");
    expect(versions.at(-1)).toBe(STABLE_FROM);
    expect(versions).toEqual(["1.0.4", "1.0.3", "1.0.2", "1.0.1"]);
    for (const version of versions) {
      expect(version).not.toMatch(/-/);
    }
  });

  it("normalizes versions and resolves locales", () => {
    expect(normalizeChangelogVersion(" v0.2.7 ")).toBe("0.2.7");
    expect(resolveChangelogLocale("zh-CN")).toBe("zh-CN");
    expect(resolveChangelogLocale("zh-TW")).toBe("zh-TW");
    expect(resolveChangelogLocale("zh-Hant")).toBe("zh-TW");
    expect(resolveChangelogLocale("zh_HK")).toBe("zh-TW");
    expect(resolveChangelogLocale("tr-TR")).toBe("tr");
    expect(resolveChangelogLocale("de-DE")).toBe("de");
    expect(resolveChangelogLocale("es-MX")).toBe("es");
    expect(resolveChangelogLocale("fr-CA")).toBe("fr");
    expect(resolveChangelogLocale("ko-KR")).toBe("ko");
    expect(resolveChangelogLocale("ko_KR")).toBe("ko");
    expect(resolveChangelogLocale("pt")).toBe("pt-BR");
    expect(resolveChangelogLocale("pt-BR")).toBe("pt-BR");
    expect(resolveChangelogLocale("pt_BR")).toBe("pt-BR");
    expect(resolveChangelogLocale("en-US")).toBe("en");
    expect(resolveChangelogLocale()).toBe("en");
  });

  it("looks up and formats notes with English fallback", () => {
    const entry = getChangelogEntry("v1.0.1", "en");
    expect(entry?.version).toBe("1.0.1");
    const notes = formatChangelogNotes("1.0.4", "en");
    expect(notes).toMatch(/^• /);
    expect(notes?.split("\n").length).toBe(
      getChangelogEntry("1.0.4", "en")?.highlights.length,
    );
    expect(formatChangelogNotes("9.9.9", "en")).toBeUndefined();
    expect(formatChangelogNotes("0.2.0-rc.6", "en")).toBeUndefined();
  });

  it("loads and caches the catalog for the resolved locale", async () => {
    const catalog = await loadChangelogCatalog("fr-CA");

    expect(catalog).toBe(CHANGELOG.fr);
    expect(await loadChangelogCatalog("fr")).toBe(catalog);
  });
});
