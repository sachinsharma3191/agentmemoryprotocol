import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerInitCommand } from "../src/commands/init.js";
import { registerStoreCommand, runStore } from "../src/commands/store.js";
import { registerListCommand } from "../src/commands/list.js";
import { registerShowCommand } from "../src/commands/show.js";
import { registerRecallCommand } from "../src/commands/recall.js";
import { registerSearchCommand, matchesFilters, searchNodes } from "../src/commands/search.js";
import { registerUpdateCommand } from "../src/commands/update.js";
import { registerMergeCommand } from "../src/commands/merge.js";
import { registerPruneCommand } from "../src/commands/prune.js";
import { registerDistillCommand } from "../src/commands/distill.js";
import { registerExportCommand, buildExportBundle } from "../src/commands/export.js";
import { registerImportCommand } from "../src/commands/import.js";
import { registerValidateCommand, validateStore } from "../src/commands/validate.js";
import { registerStatsCommand } from "../src/commands/stats.js";

import { requireStore, readManifest, writeManifest } from "../src/core/store.js";
import { requireNodeById, writeNode, nodeFilePath, listAllNodes } from "../src/core/node.js";
import { writeDailyNote, readDailyNote, dailyNotePath } from "../src/core/daily.js";
import { reindexStore, buildGraphIndex } from "../src/core/index.js";

import { runInit } from "../src/commands/init.js";
import { recallNodes, scoreNode } from "../src/commands/recall.js";

import { makeTmpDir, makeTmpStore, cleanTmp, runCommand } from "./testUtils.js";

function silence() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  return { log, err };
}

describe("init branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("uses all default values when no options provided (lines 49-59)", async () => {
    const spies = silence();
    await runCommand(registerInitCommand, "init", [], tmpDir);
    const paths = requireStore(tmpDir);
    const m = readManifest(paths);
    expect(m.store.id).toContain("store_memory-store");
    expect(m.store.name).toBe("Memory Store");
    expect(m.agent.id).toBe("assistant");
    expect(m.agent.name).toBe("assistant");
    expect(m.agent.description).toBe("A helpful AI assistant");
    expect(m.settings.default_scope).toBe("agent");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("uses agentId as agentName when agentName not provided but agentId is", async () => {
    const spies = silence();
    await runCommand(registerInitCommand, "init", ["--agent-id", "mybot"], tmpDir);
    const m = readManifest(requireStore(tmpDir));
    expect(m.agent.name).toBe("mybot");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("runInit directly with completely empty options hits all ?? fallbacks", () => {
    const spies = silence();
    runInit(tmpDir, {});
    const m = readManifest(requireStore(tmpDir));
    expect(m.store.name).toBe("Memory Store");
    expect(m.agent.id).toBe("assistant");
    expect(m.agent.name).toBe("Assistant");
    expect(m.agent.description).toBe("A helpful AI assistant");
    expect(m.settings.default_scope).toBe("agent");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("runInit with agentId but no agentName uses agentId as name", () => {
    const spies = silence();
    runInit(tmpDir, { agentId: "bot" });
    const m = readManifest(requireStore(tmpDir));
    expect(m.agent.name).toBe("bot");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("runInit with agentName provided uses it directly", () => {
    const spies = silence();
    runInit(tmpDir, { agentName: "My Bot", agentId: "bot" });
    const m = readManifest(requireStore(tmpDir));
    expect(m.agent.name).toBe("My Bot");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("store branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("normalizeType throws on invalid type (lines 127-128)", () => {
    expect(() => runStore(tmpDir, "content", { type: "invalidtype" })).toThrow(/Invalid --type/);
  });

  it("normalizeType returns undefined when type is empty string", () => {
    const node = runStore(tmpDir, "A simple statement about caching", { type: "" });
    expect(node.frontmatter.type).toBe("fact");
  });

  it("runStore with content starting with # keeps it as-is", () => {
    const node = runStore(tmpDir, "# Custom Heading\n\nBody text", { type: "fact" });
    expect(node.content.startsWith("# Custom Heading")).toBe(true);
  });

  it("runStore uses all ?? defaults when options are minimal", () => {
    const node = runStore(tmpDir, "Auto-classified content", {});
    expect(node.frontmatter.author).toContain("agent:");
    expect(node.frontmatter.scope).toBeDefined();
  });

  it("runStore truncates heading when content has more than 8 words", () => {
    const node = runStore(tmpDir, "one two three four five six seven eight nine ten eleven", { type: "fact" });
    expect(node.content).toContain("one two three four five six seven eight…");
  });
});

describe("list branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("filters by tag returning no results (line 31)", async () => {
    runStore(tmpDir, "A fact without the right tag", { type: "fact", tags: "other" });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--tag", "nonexistent"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No nodes found"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("filters by type and status simultaneously (line 31-33)", async () => {
    runStore(tmpDir, "Active fact", { type: "fact" });
    runStore(tmpDir, "User prefers dark mode", { type: "preference" });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--type", "fact", "--status", "active"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("1 node");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("sorts by id (line 35)", async () => {
    runStore(tmpDir, "Zebra fact", { type: "fact", id: "zebra-fact" });
    runStore(tmpDir, "Alpha fact", { type: "fact", id: "alpha-fact" });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--sort", "id", "--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed[0].id).toBe("alpha-fact");
    expect(parsed[1].id).toBe("zebra-fact");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("sorts by created (line 36)", async () => {
    runStore(tmpDir, "First node", { type: "fact" });
    runStore(tmpDir, "Second node", { type: "fact" });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--sort", "created"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("2 nodes"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("sorts by modified (default, line 37)", async () => {
    runStore(tmpDir, "First node for modified sort", { type: "fact" });
    runStore(tmpDir, "Second node for modified sort", { type: "fact" });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--sort", "modified"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("2 nodes"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("uses unknown sort field falls through to default modified sort", async () => {
    runStore(tmpDir, "Node A", { type: "fact" });
    runStore(tmpDir, "Node B", { type: "fact" });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--sort", "unknown"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("2 nodes"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("handles --json output with nodes", async () => {
    runStore(tmpDir, "A fact for json", { type: "fact", tags: "t1", confidence: "0.5" });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed[0].confidence).toBe(0.5);
    expect(parsed[0].tags).toContain("t1");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("show branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("shows a node without backlinks when graph has no entry (line 43)", async () => {
    runStore(tmpDir, "Orphan node with no links", { type: "fact", id: "orphan" });
    const paths = requireStore(tmpDir);
    reindexStore(paths);
    const spies = silence();
    await runCommand(registerShowCommand, "show", ["orphan"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).not.toContain("backlinks");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("recall branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("uses default limit when --limit is not passed (line 84)", async () => {
    runStore(tmpDir, "A fact about python programming", { type: "fact", tags: "python" });
    const spies = silence();
    await runCommand(registerRecallCommand, "recall", ["python"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("1 memory");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("recallNodes without limit option returns all scored results", () => {
    const node = runStore(tmpDir, "Python is great for data science", { type: "fact", tags: "python" });
    const paths = requireStore(tmpDir);
    const nodes = listAllNodes(paths);
    const results = recallNodes(nodes, "python data");
    expect(results.length).toBe(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("scoreNode with empty query terms returns score 0", () => {
    const node = runStore(tmpDir, "Some content", { type: "fact" });
    const result = scoreNode(node, []);
    expect(result.score).toBe(0);
  });
});

describe("search branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("matchesFilters returns false for type mismatch (line 27)", () => {
    const node = runStore(tmpDir, "A fact", { type: "fact" });
    expect(matchesFilters(node, { type: "preference" })).toBe(false);
  });

  it("matchesFilters returns false for status mismatch (line 27)", () => {
    const node = runStore(tmpDir, "A fact", { type: "fact" });
    expect(matchesFilters(node, { status: "archived" })).toBe(false);
  });

  it("matchesFilters returns false for tag mismatch (line 28-31 additional)", () => {
    const node = runStore(tmpDir, "A fact", { type: "fact", tags: "a" });
    expect(matchesFilters(node, { tag: "b" })).toBe(false);
  });

  it("matchesFilters returns false when created date is NaN (line 31)", () => {
    const paths = requireStore(tmpDir);
    writeNode(paths, {
      frontmatter: {
        id: "bad-date",
        type: "fact",
        created: "not-a-date",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "# Bad Date\n\nBody",
      filePath: nodeFilePath(paths, "fact", "bad-date"),
    });
    const node = requireNodeById(paths, "bad-date");
    expect(matchesFilters(node, { since: new Date("2020-01-01") })).toBe(false);
  });

  it("searchNodes returns all nodes when query is empty (line 77)", () => {
    runStore(tmpDir, "First fact", { type: "fact" });
    runStore(tmpDir, "Second fact", { type: "fact" });
    const paths = requireStore(tmpDir);
    const nodes = listAllNodes(paths);
    const results = searchNodes(nodes, "", {});
    expect(results.length).toBe(2);
  });

  it("search with --limit not a number still returns all results (line 77)", async () => {
    runStore(tmpDir, "Findable fact", { type: "fact" });
    const spies = silence();
    await runCommand(registerSearchCommand, "search", ["findable", "--limit", "NaN"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("Found 1 node");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("merge branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("handles merge where survivor has no heading (line 32)", async () => {
    const paths = requireStore(tmpDir);
    writeNode(paths, {
      frontmatter: {
        id: "nohead",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "Just text, no heading.",
      filePath: nodeFilePath(paths, "fact", "nohead"),
    });
    runStore(tmpDir, "Node with heading to merge", { type: "fact", id: "withhead" });
    const spies = silence();
    await runCommand(registerMergeCommand, "merge", ["nohead", "withhead"], tmpDir);
    const survivor = requireNodeById(paths, "nohead");
    expect(survivor.content).toContain("Merged from withhead");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("handles merge where absorbed has no confidence (line 47)", async () => {
    runStore(tmpDir, "Node A with confidence", { type: "fact", id: "confA", confidence: "0.8" });
    const paths = requireStore(tmpDir);
    writeNode(paths, {
      frontmatter: {
        id: "noconf",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "# No Conf\n\nNo confidence set.",
      filePath: nodeFilePath(paths, "fact", "noconf"),
    });
    const spies = silence();
    await runCommand(registerMergeCommand, "merge", ["confA", "noconf"], tmpDir);
    const survivor = requireNodeById(paths, "confA");
    expect(survivor.frontmatter.confidence).toBe(0.8);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("prune branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("plural heading when multiple candidates (line 86)", async () => {
    runStore(tmpDir, "Low conf one", { type: "fact", confidence: "0.1", id: "lc1" });
    runStore(tmpDir, "Low conf two", { type: "fact", confidence: "0.1", id: "lc2" });
    const spies = silence();
    await runCommand(registerPruneCommand, "prune", ["--low-confidence", "0.5", "--dry-run"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("2 nodes");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("plural message after pruning multiple nodes (line 111)", async () => {
    runStore(tmpDir, "Low conf A", { type: "fact", confidence: "0.1", id: "lcA" });
    runStore(tmpDir, "Low conf B", { type: "fact", confidence: "0.1", id: "lcB" });
    const spies = silence();
    await runCommand(registerPruneCommand, "prune", ["--low-confidence", "0.5"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("Pruned 2 nodes.");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("distill branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("uses today's date when --date is not provided (line 27)", async () => {
    const spies = silence();
    await runCommand(registerDistillCommand, "distill", [], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No daily note found"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("export branch coverage", () => {
  let tmpDir: string;
  let outDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); outDir = makeTmpDir(); });
  afterEach(() => { cleanTmp(tmpDir); cleanTmp(outDir); });

  it("exports amp format using default output path (line 87,90)", async () => {
    runStore(tmpDir, "Fact for default amp export", { type: "fact" });
    const spies = silence();
    await runCommand(registerExportCommand, "export", ["--format", "amp"], tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "amp-export", ".amp"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("exports markdown format using default output path (line 108)", async () => {
    runStore(tmpDir, "Fact for default markdown export", { type: "fact" });
    const spies = silence();
    await runCommand(registerExportCommand, "export", ["--format", "markdown"], tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "amp-export.md"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("import branch coverage", () => {
  let tmpDir: string;
  let bundleDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); bundleDir = makeTmpDir(); });
  afterEach(() => { cleanTmp(tmpDir); cleanTmp(bundleDir); });

  it("handles bundle with no daily array (line 64 ?? fallback)", async () => {
    const bundle = {
      amp: "0.1",
      exported: new Date().toISOString(),
      manifest: readManifest(requireStore(tmpDir)),
      nodes: [
        {
          frontmatter: {
            id: "nodaily",
            type: "fact",
            created: "2024-01-01T00:00:00.000Z",
            modified: "2024-01-01T00:00:00.000Z",
            author: "agent:tester",
            status: "active",
          },
          content: "# NoDailyArray\n\nBody",
        },
      ],
    };
    const exportFile = path.join(bundleDir, "nodaily.json");
    fs.writeFileSync(exportFile, JSON.stringify(bundle), "utf-8");
    const spies = silence();
    await runCommand(registerImportCommand, "import", [exportFile], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("nodes imported: 1"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("overwrites an existing daily note when --overwrite is set (line 64,68)", async () => {
    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-07-10", agent: "tester", status: "pending" },
      content: "- original bullet",
      filePath: dailyNotePath(paths, "2024-07-10"),
    });
    const bundle = {
      amp: "0.1",
      exported: new Date().toISOString(),
      manifest: readManifest(paths),
      nodes: [],
      daily: [{ frontmatter: { date: "2024-07-10", agent: "imported", status: "pending" }, content: "- new bullet" }],
    };
    const exportFile = path.join(bundleDir, "daily-import.json");
    fs.writeFileSync(exportFile, JSON.stringify(bundle), "utf-8");
    const spies = silence();
    await runCommand(registerImportCommand, "import", [exportFile, "--overwrite"], tmpDir);
    const note = readDailyNote(paths, "2024-07-10");
    expect(note?.content).toContain("new bullet");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips daily notes without --overwrite when they exist (line 68)", async () => {
    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-07-11", agent: "tester", status: "pending" },
      content: "- original",
      filePath: dailyNotePath(paths, "2024-07-11"),
    });
    const bundle = {
      amp: "0.1",
      exported: new Date().toISOString(),
      manifest: readManifest(paths),
      nodes: [],
      daily: [{ frontmatter: { date: "2024-07-11", agent: "imported", status: "pending" }, content: "- new" }],
    };
    const exportFile = path.join(bundleDir, "daily-skip.json");
    fs.writeFileSync(exportFile, JSON.stringify(bundle), "utf-8");
    const spies = silence();
    await runCommand(registerImportCommand, "import", [exportFile], tmpDir);
    const note = readDailyNote(paths, "2024-07-11");
    expect(note?.content).toContain("original");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("validate branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); process.exitCode = undefined; });

  it("reports text output with warnings and errors (lines 49-51)", async () => {
    const paths = requireStore(tmpDir);
    writeNode(paths, {
      frontmatter: {
        id: "badval",
        type: "not-a-type" as never,
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
        scope: "not-a-scope" as never,
      },
      content: "# Bad\n\nBody",
      filePath: nodeFilePath(paths, "fact", "badval"),
    });
    const spies = silence();
    await runCommand(registerValidateCommand, "validate", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("error");
    expect(printed).toContain("warning");
    expect(process.exitCode).toBe(1);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("stats branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("handles nodes without tags (line 33)", async () => {
    runStore(tmpDir, "A fact without any tags at all", { type: "fact" });
    const spies = silence();
    await runCommand(registerStatsCommand, "stats", ["--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed.topTags).toEqual([]);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("list ?? branch coverage for tags/created/modified", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("handles nodes with no tags field in filter and display", async () => {
    const paths = requireStore(tmpDir);
    writeNode(paths, {
      frontmatter: {
        id: "no-tags-node",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "# No Tags\n\nNode without tags field",
      filePath: nodeFilePath(paths, "fact", "no-tags-node"),
    });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--tag", "anything"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No nodes found"))).toBe(true);

    spies.log.mockClear();
    await runCommand(registerListCommand, "list", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("no-tags-node");
    expect(printed).not.toContain("tags:");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("handles nodes with undefined created/modified in sort comparisons", async () => {
    const paths = requireStore(tmpDir);
    writeNode(paths, {
      frontmatter: {
        id: "no-dates",
        type: "fact",
        created: "",
        modified: "",
        author: "agent:tester",
        status: "active",
      },
      content: "# No Dates\n\nMissing timestamps",
      filePath: nodeFilePath(paths, "fact", "no-dates"),
    });
    runStore(tmpDir, "Normal dated fact", { type: "fact" });
    const spies = silence();
    await runCommand(registerListCommand, "list", ["--sort", "created"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("2 nodes"))).toBe(true);
    spies.log.mockClear();
    await runCommand(registerListCommand, "list", ["--sort", "modified"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("2 nodes"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("show ?? branch for empty backlinks", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("handles graph with node entry but empty incoming array", async () => {
    runStore(tmpDir, "Node referencing [[nonexistent]]", { type: "fact", id: "has-links" });
    const paths = requireStore(tmpDir);
    reindexStore(paths);
    const spies = silence();
    await runCommand(registerShowCommand, "show", ["has-links"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).not.toContain("backlinks");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("recall ?? branch for limit", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("recallNodes called directly without limit uses all results", () => {
    runStore(tmpDir, "Python is great", { type: "fact", tags: "python" });
    const paths = requireStore(tmpDir);
    const nodes = listAllNodes(paths);
    const results = recallNodes(nodes, "python", {});
    expect(results.length).toBe(1);
  });
});

describe("search ?? branch for limit", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("searchNodes with empty query returns all matching", () => {
    runStore(tmpDir, "Fact one", { type: "fact" });
    runStore(tmpDir, "Fact two", { type: "fact" });
    const paths = requireStore(tmpDir);
    const nodes = listAllNodes(paths);
    const results = searchNodes(nodes, "", {});
    expect(results.length).toBe(2);
  });
});

describe("merge ?? branch for confidence", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("merging when survivor has no confidence uses 0 as fallback", async () => {
    const paths = requireStore(tmpDir);
    writeNode(paths, {
      frontmatter: {
        id: "surv-noconf",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "# Survivor\n\nNo confidence.",
      filePath: nodeFilePath(paths, "fact", "surv-noconf"),
    });
    runStore(tmpDir, "Absorbed with confidence", { type: "fact", id: "abs-conf", confidence: "0.7" });
    const spies = silence();
    await runCommand(registerMergeCommand, "merge", ["surv-noconf", "abs-conf"], tmpDir);
    const survivor = requireNodeById(paths, "surv-noconf");
    expect(survivor.frontmatter.confidence).toBe(0.7);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("update ?? branch for content heading", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("updates content on a node with a heading preserves the heading", async () => {
    runStore(tmpDir, "Original content here", { type: "fact", id: "headed" });
    const spies = silence();
    await runCommand(registerUpdateCommand, "update", ["headed", "--content", "New body without heading prefix"], tmpDir);
    const node = requireNodeById(requireStore(tmpDir), "headed");
    expect(node.content).toContain("# ");
    expect(node.content).toContain("New body without heading prefix");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("validate text output with warnings-only (lines 49-51)", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); process.exitCode = undefined; });

  it("reports only warnings in text mode without setting exitCode", async () => {
    const paths = requireStore(tmpDir);
    writeNode(paths, {
      frontmatter: {
        id: "warn-only",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
        scope: "unknown-scope" as never,
      },
      content: "# Warning Only\n\nBody",
      filePath: nodeFilePath(paths, "fact", "warn-only"),
    });
    const spies = silence();
    await runCommand(registerValidateCommand, "validate", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("warning");
    expect(printed).toContain("0 error");
    expect(process.exitCode).toBeUndefined();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("export ?? for output path", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("uses default json output path when --output is not provided", async () => {
    runStore(tmpDir, "Export default path fact", { type: "fact" });
    const spies = silence();
    await runCommand(registerExportCommand, "export", ["--format", "json"], tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "amp-export.json"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
    fs.rmSync(path.join(tmpDir, "amp-export.json"));
  });
});

describe("core/index branch coverage", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("handles nodes with typed frontmatter links (lines 50,56)", () => {
    const paths = requireStore(tmpDir);
    runStore(tmpDir, "Target node content", { type: "fact", id: "link-target" });
    writeNode(paths, {
      frontmatter: {
        id: "link-source",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
        links: [{ target: "link-target", relation: "depends_on" }],
      },
      content: "# Link Source\n\nReferences [[link-target]] inline.",
      filePath: nodeFilePath(paths, "fact", "link-source"),
    });
    const nodes = listAllNodes(paths);
    const graph = buildGraphIndex(nodes);
    expect(graph.nodes["link-source"].outgoing.length).toBeGreaterThan(0);
    expect(graph.nodes["link-target"].incoming.length).toBeGreaterThan(0);
    const typed = graph.nodes["link-source"].outgoing.find((l) => l.relation === "depends_on");
    expect(typed).toBeDefined();
  });
});

describe("update additional branches", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpStore(); });
  afterEach(() => { cleanTmp(tmpDir); });

  it("updates content that starts with # heading (line 39)", async () => {
    runStore(tmpDir, "Original content", { type: "fact", id: "headupdate" });
    const spies = silence();
    await runCommand(registerUpdateCommand, "update", ["headupdate", "--content", "# New Heading\n\nNew body"], tmpDir);
    const node = requireNodeById(requireStore(tmpDir), "headupdate");
    expect(node.content.startsWith("# New Heading")).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("add-tag when node has no existing tags (line 48)", async () => {
    runStore(tmpDir, "No tag fact", { type: "fact", id: "notag" });
    const spies = silence();
    await runCommand(registerUpdateCommand, "update", ["notag", "--add-tag", "newtag"], tmpDir);
    const node = requireNodeById(requireStore(tmpDir), "notag");
    expect(node.frontmatter.tags).toContain("newtag");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("remove-tag when node has no existing tags (line 54)", async () => {
    runStore(tmpDir, "No tag fact for remove", { type: "fact", id: "notag2" });
    const spies = silence();
    await runCommand(registerUpdateCommand, "update", ["notag2", "--remove-tag", "nonexistent"], tmpDir);
    const node = requireNodeById(requireStore(tmpDir), "notag2");
    expect(node.frontmatter.tags).toEqual([]);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});
