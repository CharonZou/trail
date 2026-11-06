import { describe, expect, it } from "vitest";
import {
  formatSessionLink,
  isSessionLinkToken,
  MAX_SESSION_LINKS_PER_MESSAGE,
  parseSessionLinks,
  parseSessionLinkToken,
  sessionLinkSpans,
} from "./session-link.js";

describe("session links", () => {
  it("round-trips the link a session row copies", () => {
    const id = "6f1d2c3b-4a59-4e7f-8a90-b1c2d3e4f506";
    const link = formatSessionLink(id);
    expect(link).toBe(`trail://session/${id}`);
    expect(parseSessionLinks(`please look at ${link} first`)).toEqual([id]);
  });

  it("keeps first-mention order and drops duplicates", () => {
    const text = [
      formatSessionLink("aaa"),
      formatSessionLink("bbb"),
      formatSessionLink("aaa"),
    ].join(" and ");
    expect(parseSessionLinks(text)).toEqual(["aaa", "bbb"]);
  });

  it("stops at the message bound", () => {
    const text = Array.from({ length: MAX_SESSION_LINKS_PER_MESSAGE + 3 }, (_, index) =>
      formatSessionLink(`session-${index}`),
    ).join(" ");
    expect(parseSessionLinks(text)).toHaveLength(MAX_SESSION_LINKS_PER_MESSAGE);
  });

  it("ignores prose, other schemes and remote ids", () => {
    expect(parseSessionLinks("")).toEqual([]);
    expect(parseSessionLinks("no links here")).toEqual([]);
    // A remote session id carries a colon, so it never parses as a local link.
    expect(parseSessionLinks("trail://session/remote:abc")).toEqual([]);
    expect(parseSessionLinks("https://example.com/session/abc")).toEqual([]);
    expect(parseSessionLinks("trail://session/")).toEqual([]);
  });

  it("still reads links written before the Trail rename", () => {
    const id = "6f1d2c3b-4a59-4e7f-8a90-b1c2d3e4f506";
    const legacy = `pi-desktop://session/${id}`;

    expect(parseSessionLinks(`please look at ${legacy} first`)).toEqual([id]);
    expect(parseSessionLinkToken(legacy)).toBe(id);
    expect(isSessionLinkToken(legacy)).toBe(true);
    expect(parseSessionLinks("pi-desktop://session/remote:abc")).toEqual([]);
    expect(
      sessionLinkSpans(`old ${legacy} and trail://session/zzz`).map((span) => span.id),
    ).toEqual([id, "zzz"]);

    // A copied row only ever emits the current scheme.
    expect(formatSessionLink(id)).toBe(`trail://session/${id}`);
  });

  it("recognizes one token without scanning prose", () => {
    expect(isSessionLinkToken(formatSessionLink("abc"))).toBe(true);
    expect(isSessionLinkToken("@src/index.ts")).toBe(false);
  });
  it("names the id only when the whole token is one link", () => {
    expect(parseSessionLinkToken(formatSessionLink("abc"))).toBe("abc");
    expect(parseSessionLinkToken(`  ${formatSessionLink("abc")}  `)).toBe("abc");
    expect(parseSessionLinkToken(`see ${formatSessionLink("abc")}`)).toBeNull();
    expect(parseSessionLinkToken("trail://session/")).toBeNull();
    expect(parseSessionLinkToken("@src/index.ts")).toBeNull();
  });

  it("reports every link span in text order", () => {
    const text = `first ${formatSessionLink("aaa")} then ${formatSessionLink("bbb")}`;
    const spans = sessionLinkSpans(text);
    expect(spans.map((span) => span.id)).toEqual(["aaa", "bbb"]);
    expect(text.slice(spans[0].start, spans[0].end)).toBe(formatSessionLink("aaa"));
    expect(text.slice(spans[1].start, spans[1].end)).toBe(formatSessionLink("bbb"));
    expect(sessionLinkSpans("nothing here")).toEqual([]);
  });
});
