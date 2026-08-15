import { describe, expect, it, vi } from "vitest";
import {
  clamp,
  deriveTitle,
  extractWikiLinks,
  generateIdFromContent,
  isValidId,
  nowIso,
  overlapScore,
  slugify,
  todayDate,
  toDateOnly,
  tokenize,
  truncate,
} from "../src/utils/helpers.js";
import {
  chalk,
  colorStatus,
  colorType,
  dim,
  error,
  heading,
  info,
  kv,
  printError,
  success,
  warn,
} from "../src/utils/ui.js";

describe("helpers.ts", () => {
  it("slugify strips accents and punctuation", () => {
    expect(slugify("Café déjà vu!!")).toBe("cafe-deja-vu");
    expect(slugify("---leading and trailing---")).toBe("leading-and-trailing");
    expect(slugify("multi   space")).toBe("multi-space");
  });

  it("generateIdFromContent falls back to a timestamp id when all words are stopwords", () => {
    const id = generateIdFromContent("the a an is are");
    expect(id).toMatch(/^node-\d+$/);
  });

  it("generateIdFromContent respects a custom word count", () => {
    const id = generateIdFromContent("alpha beta gamma delta epsilon zeta eta", 2);
    expect(id.split("-").length).toBeLessThanOrEqual(2);
  });

  it("tokenize can keep stopwords when asked", () => {
    const withStop = tokenize("the quick brown fox", false);
    expect(withStop).toContain("the");
    const withoutStop = tokenize("the quick brown fox");
    expect(withoutStop).not.toContain("the");
  });

  it("tokenize drops single-letter tokens", () => {
    const tokens = tokenize("a b cd e fg");
    expect(tokens).not.toContain("a");
    expect(tokens).toContain("cd");
  });

  it("nowIso returns a parseable ISO timestamp", () => {
    const iso = nowIso();
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });

  it("todayDate returns YYYY-MM-DD", () => {
    expect(todayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("toDateOnly slices an ISO string down to the date", () => {
    expect(toDateOnly("2024-05-01T12:34:56.000Z")).toBe("2024-05-01");
  });

  it("overlapScore is 0 when either side is empty", () => {
    expect(overlapScore([], ["a"])).toBe(0);
    expect(overlapScore(["a"], [])).toBe(0);
  });

  it("overlapScore computes the fraction of query terms present in the doc", () => {
    expect(overlapScore(["a", "b", "c"], ["a", "c"])).toBeCloseTo(2 / 3);
  });

  it("truncate returns short text unchanged", () => {
    expect(truncate("short text")).toBe("short text");
  });

  it("truncate collapses whitespace and adds an ellipsis when too long", () => {
    const long = "word ".repeat(40);
    const result = truncate(long, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith("…")).toBe(true);
  });

  it("extractWikiLinks finds unique [[id]] references", () => {
    const ids = extractWikiLinks("See [[node-a]] and [[node-b]], also [[node-a]] again.");
    expect(ids).toEqual(["node-a", "node-b"]);
  });

  it("extractWikiLinks returns an empty array when there are no links", () => {
    expect(extractWikiLinks("no links here")).toEqual([]);
  });

  it("deriveTitle prefers the first markdown heading", () => {
    expect(deriveTitle("# My Heading\n\nBody text")).toBe("My Heading");
  });

  it("deriveTitle falls back to the first non-empty line when there is no heading", () => {
    expect(deriveTitle("\n\nFirst real line here")).toBe("First real line here");
  });

  it("deriveTitle falls back to Untitled when content is blank", () => {
    expect(deriveTitle("   \n   \n")).toBe("Untitled");
  });

  it("clamp bounds a number within [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it("isValidId accepts kebab-case ids and rejects everything else", () => {
    expect(isValidId("valid-id-123")).toBe(true);
    expect(isValidId("Invalid_ID")).toBe(false);
    expect(isValidId("-leading-dash")).toBe(false);
    expect(isValidId("")).toBe(false);
  });
});

describe("ui.ts", () => {
  it("colorType colors known types and falls back to white for unknown ones", () => {
    expect(chalk.level).toBeDefined();
    expect(typeof colorType("fact")).toBe("string");
    expect(typeof colorType("episode")).toBe("string");
    expect(typeof colorType("preference")).toBe("string");
    expect(typeof colorType("procedure")).toBe("string");
    expect(typeof colorType("reflection")).toBe("string");
    expect(typeof colorType("relation")).toBe("string");
    expect(colorType("unknown-type")).toContain("unknown-type");
  });

  it("colorStatus colors known statuses and falls back to white for unknown ones", () => {
    expect(typeof colorStatus("active")).toBe("string");
    expect(typeof colorStatus("archived")).toBe("string");
    expect(typeof colorStatus("superseded")).toBe("string");
    expect(typeof colorStatus("disputed")).toBe("string");
    expect(typeof colorStatus("redacted")).toBe("string");
    expect(colorStatus("unknown-status")).toContain("unknown-status");
  });

  it("heading/success/error/warn/info/dim/kv all produce strings containing their input", () => {
    expect(heading("Title")).toContain("Title");
    expect(success("done")).toContain("done");
    expect(error("bad")).toContain("bad");
    expect(warn("careful")).toContain("careful");
    expect(info("fyi")).toContain("fyi");
    expect(dim("subtle")).toContain("subtle");
    expect(kv("key", "value")).toContain("value");
    expect(kv("key", "value")).toContain("key");
  });

  it("printError prints Error messages via console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    printError(new Error("boom"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("boom");
    spy.mockRestore();
  });

  it("printError stringifies non-Error values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    printError("just a string");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("just a string");
    spy.mockRestore();
  });
});
