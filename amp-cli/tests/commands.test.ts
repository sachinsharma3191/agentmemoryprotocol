import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerInitCommand } from "../src/commands/init.js";
import { registerStoreCommand } from "../src/commands/store.js";
import { registerListCommand } from "../src/commands/list.js";
import { registerShowCommand } from "../src/commands/show.js";
import { registerRecallCommand } from "../src/commands/recall.js";
import { registerSearchCommand } from "../src/commands/search.js";
import { registerUpdateCommand } from "../src/commands/update.js";
import { registerArchiveCommand } from "../src/commands/archive.js";
import { registerMergeCommand } from "../src/commands/merge.js";
import { registerPruneCommand } from "../src/commands/prune.js";
import { registerDistillCommand } from "../src/commands/distill.js";
import { registerReindexCommand } from "../src/commands/reindex.js";
import { registerExportCommand } from "../src/commands/export.js";
import { registerImportCommand } from "../src/commands/import.js";
import { registerValidateCommand } from "../src/commands/validate.js";
import { registerStatsCommand } from "../src/commands/stats.js";

import { requireStore, readManifest, writeManifest } from "../src/core/store.js";
import { writeDailyNote, readDailyNote, dailyNotePath } from "../src/core/daily.js";
import { readKeywordsIndex } from "../src/core/index.js";
import { runStore } from "../src/commands/store.js";
import { runInit } from "../src/commands/init.js";

import { makeTmpDir, makeTmpStore, cleanTmp, runCommand } from "./testUtils.js";

function silence() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  return { log, err };
}

describe("init command (via commander)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("initializes a store with all options provided", async () => {
    const spies = silence();
    await runCommand(
      registerInitCommand,
      "init",
      [
        "--name",
        "My Store",
        "--agent-id",
        "myagent",
        "--agent-name",
        "My Agent",
        "--description",
        "desc",
        "--scope",
        "team",
      ],
      tmpDir
    );
    const paths = requireStore(tmpDir);
    const manifest = readManifest(paths);
    expect(manifest.store.name).toBe("My Store");
    expect(manifest.agent.id).toBe("myagent");
    expect(manifest.agent.name).toBe("My Agent");
    expect(manifest.agent.description).toBe("desc");
    expect(manifest.settings.default_scope).toBe("team");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("initializes a store with defaults when no options are given", async () => {
    const spies = silence();
    await runCommand(registerInitCommand, "init", [], tmpDir);
    const paths = requireStore(tmpDir);
    const manifest = readManifest(paths);
    expect(manifest.store.name).toBe("Memory Store");
    expect(manifest.agent.id).toBe("assistant");
    expect(manifest.agent.name).toBe("assistant");
    expect(manifest.agent.description).toBe("A helpful AI assistant");
    expect(manifest.settings.default_scope).toBe("agent");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("warns and refuses to reinit an existing store without --force", async () => {
    const spies = silence();
    await runCommand(registerInitCommand, "init", ["--name", "First"], tmpDir);
    await runCommand(registerInitCommand, "init", ["--name", "Second"], tmpDir);
    const manifest = readManifest(requireStore(tmpDir));
    expect(manifest.store.name).toBe("First");
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("already exists"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("reinitializes an existing store when --force is passed", async () => {
    const spies = silence();
    await runCommand(registerInitCommand, "init", ["--name", "First"], tmpDir);
    await runCommand(registerInitCommand, "init", ["--name", "Second", "--force"], tmpDir);
    const manifest = readManifest(requireStore(tmpDir));
    expect(manifest.store.name).toBe("Second");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("store command (via commander)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("stores content with tags and prints tag summary", async () => {
    const spies = silence();
    await runCommand(registerStoreCommand, "store", ["User prefers spaces over tabs", "--tags", "editor, style"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("tags"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("stores content without tags and omits the tag summary line", async () => {
    const spies = silence();
    await runCommand(registerStoreCommand, "store", ["A fact with no tags at all here"], tmpDir);
    const printedTagLine = spies.log.mock.calls.some((c) => String(c[0]).startsWith("tags:"));
    expect(printedTagLine).toBe(false);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("runStore skips reindexing when noIndex is set", () => {
    const paths = requireStore(tmpDir);
    const node = runStore(tmpDir, "Something to store without reindex", { type: "fact", noIndex: true });
    expect(node.frontmatter.id).toBeDefined();
    expect(readKeywordsIndex(paths)).toBeNull();
  });

  it("runStore skips reindexing when the manifest disables auto_index", () => {
    const paths = requireStore(tmpDir);
    const manifest = readManifest(paths);
    manifest.settings.auto_index = false;
    writeManifest(paths, manifest);
    runStore(tmpDir, "Something stored with auto_index disabled", { type: "fact" });
    expect(readKeywordsIndex(paths)).toBeNull();
  });
});

describe("list command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("prints a message when there are no nodes", async () => {
    const spies = silence();
    await runCommand(registerListCommand, "list", [], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No nodes found"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("lists a single node with singular heading, confidence, and tags", async () => {
    runStore(tmpDir, "Only one node here with tags", { type: "fact", tags: "a,b", confidence: "0.5" });
    const spies = silence();
    await runCommand(registerListCommand, "list", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("1 node");
    expect(printed).not.toContain("1 nodes");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("lists multiple nodes with plural heading and filters by type/status/tag", async () => {
    runStore(tmpDir, "First fact about databases", { type: "fact", tags: "db" });
    runStore(tmpDir, "User prefers dark mode everywhere", { type: "preference", tags: "ui" });
    const spies = silence();

    await runCommand(registerListCommand, "list", [], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("2 nodes"))).toBe(true);

    spies.log.mockClear();
    await runCommand(registerListCommand, "list", ["--type", "preference"], tmpDir);
    let printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("1 node");

    spies.log.mockClear();
    await runCommand(registerListCommand, "list", ["--status", "active"], tmpDir);
    printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("2 nodes");

    spies.log.mockClear();
    await runCommand(registerListCommand, "list", ["--tag", "ui"], tmpDir);
    printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("1 node");

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("sorts by id, by created, and by modified (default)", async () => {
    runStore(tmpDir, "Zebra fact content here", { type: "fact", id: "zebra" });
    runStore(tmpDir, "Alpha fact content here", { type: "fact", id: "alpha" });
    const spies = silence();

    await runCommand(registerListCommand, "list", ["--sort", "id", "--json"], tmpDir);
    let parsed = JSON.parse(spies.log.mock.calls[spies.log.mock.calls.length - 1][0] as string);
    expect(parsed.map((n: { id: string }) => n.id)).toEqual(["alpha", "zebra"]);

    spies.log.mockClear();
    await runCommand(registerListCommand, "list", ["--sort", "created", "--json"], tmpDir);
    parsed = JSON.parse(spies.log.mock.calls[spies.log.mock.calls.length - 1][0] as string);
    expect(parsed.length).toBe(2);

    spies.log.mockClear();
    await runCommand(registerListCommand, "list", ["--json"], tmpDir);
    parsed = JSON.parse(spies.log.mock.calls[spies.log.mock.calls.length - 1][0] as string);
    expect(parsed.length).toBe(2);

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("prints node summaries without a confidence suffix or tags line when absent", async () => {
    runStore(tmpDir, "A plain fact with nothing extra attached", { type: "fact" });
    const spies = silence();
    await runCommand(registerListCommand, "list", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).not.toContain("tags:");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("show command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("shows a node with every optional field populated, including backlinks", async () => {
    const paths = requireStore(tmpDir);
    runStore(tmpDir, "Target node content for linking", { type: "fact", id: "target-a" });
    const source = runStore(tmpDir, "Source node content linking elsewhere", {
      type: "fact",
      id: "source-a",
      tags: "x,y",
      confidence: "0.8",
      source: "conversation:abc",
      scope: "team",
    });
    const { requireNodeById, writeNode } = await import("../src/core/node.js");
    const node = requireNodeById(paths, source.frontmatter.id);
    node.frontmatter.links = [{ target: "target-a", relation: "relates_to" }];
    node.frontmatter.superseded_by = "target-a";
    node.frontmatter.ttl = "P30D";
    writeNode(paths, node);
    const { reindexStore } = await import("../src/core/index.js");
    reindexStore(paths);

    const spies = silence();
    await runCommand(registerShowCommand, "show", ["target-a"], tmpDir);
    let printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("backlinks");

    spies.log.mockClear();
    await runCommand(registerShowCommand, "show", ["source-a"], tmpDir);
    printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("source");
    expect(printed).toContain("scope");
    expect(printed).toContain("confidence");
    expect(printed).toContain("tags");
    expect(printed).toContain("superseded_by");
    expect(printed).toContain("ttl");
    expect(printed).toContain("links");

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("shows a node with no optional fields and no backlinks, and supports --json", async () => {
    runStore(tmpDir, "Minimal fact with nothing optional set", { type: "fact", id: "minimal" });
    const spies = silence();
    await runCommand(registerShowCommand, "show", ["minimal"], tmpDir);
    let printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).not.toContain("backlinks");

    spies.log.mockClear();
    await runCommand(registerShowCommand, "show", ["minimal", "--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed.frontmatter.id).toBe("minimal");

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("throws when the node does not exist", async () => {
    await expect(runCommand(registerShowCommand, "show", ["nope"], tmpDir)).rejects.toThrow();
  });
});

describe("recall command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("prints a no-results message when nothing matches", async () => {
    runStore(tmpDir, "Something entirely unrelated to the query", { type: "fact" });
    const spies = silence();
    await runCommand(registerRecallCommand, "recall", ["zzz_no_match_zzz"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No memories found"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("recalls a single result with singular wording and matched terms, supports --json and --limit", async () => {
    runStore(tmpDir, "User prefers Python for backend development work", {
      type: "preference",
      tags: "python",
    });
    const spies = silence();
    await runCommand(registerRecallCommand, "recall", ["python backend"], tmpDir);
    let printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("1 memory");
    expect(printed).toContain("matched:");

    spies.log.mockClear();
    await runCommand(registerRecallCommand, "recall", ["python backend", "--json", "--limit", "1"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed.length).toBe(1);

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("recalls multiple results with plural wording and honors --status filter", async () => {
    runStore(tmpDir, "User prefers tabs for indentation in code", { type: "preference", tags: "style" });
    runStore(tmpDir, "User prefers spaces for indentation as well", { type: "preference", tags: "style" });
    const spies = silence();
    await runCommand(registerRecallCommand, "recall", ["indentation preference"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("memories");

    spies.log.mockClear();
    await runCommand(registerRecallCommand, "recall", ["indentation preference", "--status", "archived"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No memories found"))).toBe(true);

    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("search command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("throws on an invalid --since date", async () => {
    await expect(
      runCommand(registerSearchCommand, "search", ["query", "--since", "not-a-date"], tmpDir)
    ).rejects.toThrow(/Invalid --since/);
  });

  it("filters by a valid --since date", async () => {
    runStore(tmpDir, "Recent fact about deployments", { type: "fact", tags: "deploy" });
    const spies = silence();
    await runCommand(registerSearchCommand, "search", ["deploy", "--since", "2000-01-01"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Found 1 node"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("prints a no-match message and supports --json output", async () => {
    runStore(tmpDir, "Some searchable fact content", { type: "fact" });
    const spies = silence();
    await runCommand(registerSearchCommand, "search", ["nonexistentzzz"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No matches"))).toBe(true);

    spies.log.mockClear();
    await runCommand(registerSearchCommand, "search", ["searchable", "--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed.length).toBe(1);

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("prints multiple matches with tags and filters by type/status/tag/limit", async () => {
    runStore(tmpDir, "Searchable fact one about caching", { type: "fact", tags: "cache" });
    runStore(tmpDir, "Searchable fact two about caching layers", { type: "fact", tags: "cache" });
    const spies = silence();
    await runCommand(registerSearchCommand, "search", ["searchable", "--type", "fact", "--status", "active", "--tag", "cache"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("Found 2 nodes");
    expect(printed).toContain("tags:");

    spies.log.mockClear();
    await runCommand(registerSearchCommand, "search", ["searchable", "--limit", "not-a-number"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Found 2 nodes"))).toBe(true);

    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("update command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("reports nothing-to-update when no options are passed", async () => {
    runStore(tmpDir, "A fact to leave untouched", { type: "fact", id: "untouched" });
    const spies = silence();
    await runCommand(registerUpdateCommand, "update", ["untouched"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Nothing to update"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("updates content (replacing a heading-less body), tags, add-tag, remove-tag, confidence, and status", async () => {
    const paths = requireStore(tmpDir);
    const { writeNode } = await import("../src/core/node.js");
    const { nodeFilePath } = await import("../src/core/node.js");
    // Write a node whose content has no leading heading, to hit the `?? id` fallback.
    const filePath = nodeFilePath(paths, "fact", "headingless");
    writeNode(paths, {
      frontmatter: {
        id: "headingless",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "No heading here, just text.",
      filePath,
    });

    const spies = silence();
    await runCommand(registerUpdateCommand, "update", ["headingless", "--content", "New body content"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Updated"))).toBe(true);

    const { requireNodeById } = await import("../src/core/node.js");
    let node = requireNodeById(paths, "headingless");
    expect(node.content).toContain("New body content");
    expect(node.content.startsWith("#")).toBe(true);

    spies.log.mockClear();
    await runCommand(registerUpdateCommand, "update", ["headingless", "--content", "# Explicit Heading\n\nBody"], tmpDir);
    node = requireNodeById(paths, "headingless");
    expect(node.content.startsWith("# Explicit Heading")).toBe(true);

    spies.log.mockClear();
    await runCommand(registerUpdateCommand, "update", ["headingless", "--tags", "a, b"], tmpDir);
    node = requireNodeById(paths, "headingless");
    expect(node.frontmatter.tags).toEqual(["a", "b"]);

    spies.log.mockClear();
    await runCommand(registerUpdateCommand, "update", ["headingless", "--add-tag", "c"], tmpDir);
    node = requireNodeById(paths, "headingless");
    expect(node.frontmatter.tags).toContain("c");

    spies.log.mockClear();
    await runCommand(registerUpdateCommand, "update", ["headingless", "--remove-tag", "c"], tmpDir);
    node = requireNodeById(paths, "headingless");
    expect(node.frontmatter.tags).not.toContain("c");

    spies.log.mockClear();
    await runCommand(registerUpdateCommand, "update", ["headingless", "--confidence", "0.42"], tmpDir);
    node = requireNodeById(paths, "headingless");
    expect(node.frontmatter.confidence).toBe(0.42);

    spies.log.mockClear();
    await runCommand(registerUpdateCommand, "update", ["headingless", "--status", "archived"], tmpDir);
    node = requireNodeById(paths, "headingless");
    expect(node.frontmatter.status).toBe("archived");

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("rejects an invalid --confidence value", async () => {
    runStore(tmpDir, "A fact for confidence validation", { type: "fact", id: "confcheck" });
    await expect(
      runCommand(registerUpdateCommand, "update", ["confcheck", "--confidence", "5"], tmpDir)
    ).rejects.toThrow(/--confidence must be/);
  });

  it("skips reindexing when noIndex is forced true", async () => {
    runStore(tmpDir, "A fact for noIndex update test", { type: "fact", id: "noindexupdate" });
    const paths = requireStore(tmpDir);
    const { reindexStore, readKeywordsIndex } = await import("../src/core/index.js");
    reindexStore(paths);
    fs.rmSync(paths.keywordsFile);
    const spies = silence();
    await runCommand(registerUpdateCommand, "update", ["noindexupdate", "--status", "archived"], tmpDir, { noIndex: true });
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when the manifest disables auto_index", async () => {
    runStore(tmpDir, "A fact for auto_index-disabled update test", { type: "fact", id: "autoidxupdate" });
    const paths = requireStore(tmpDir);
    const { reindexStore, readKeywordsIndex } = await import("../src/core/index.js");
    reindexStore(paths);
    fs.rmSync(paths.keywordsFile);
    const manifest = readManifest(paths);
    manifest.settings.auto_index = false;
    writeManifest(paths, manifest);
    const spies = silence();
    await runCommand(registerUpdateCommand, "update", ["autoidxupdate", "--status", "archived"], tmpDir);
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("archive command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("archives a node", async () => {
    runStore(tmpDir, "A fact to archive", { type: "fact", id: "archiveme" });
    const spies = silence();
    await runCommand(registerArchiveCommand, "archive", ["archiveme"], tmpDir);
    const paths = requireStore(tmpDir);
    const { requireNodeById } = await import("../src/core/node.js");
    expect(requireNodeById(paths, "archiveme").frontmatter.status).toBe("archived");
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Archived"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when noIndex is forced true", async () => {
    runStore(tmpDir, "A fact to archive without reindex", { type: "fact", id: "archivenoindex" });
    const paths = requireStore(tmpDir);
    const { reindexStore, readKeywordsIndex } = await import("../src/core/index.js");
    reindexStore(paths);
    fs.rmSync(paths.keywordsFile);
    const spies = silence();
    await runCommand(registerArchiveCommand, "archive", ["archivenoindex"], tmpDir, { noIndex: true });
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when the manifest disables auto_index", async () => {
    runStore(tmpDir, "A fact to archive with auto_index disabled", { type: "fact", id: "archiveautoidx" });
    const paths = requireStore(tmpDir);
    const { reindexStore, readKeywordsIndex } = await import("../src/core/index.js");
    reindexStore(paths);
    fs.rmSync(paths.keywordsFile);
    const manifest = readManifest(paths);
    manifest.settings.auto_index = false;
    writeManifest(paths, manifest);
    const spies = silence();
    await runCommand(registerArchiveCommand, "archive", ["archiveautoidx"], tmpDir);
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("merge command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("throws when merging a node with itself", async () => {
    runStore(tmpDir, "Solo node", { type: "fact", id: "solo" });
    await expect(runCommand(registerMergeCommand, "merge", ["solo", "solo"], tmpDir)).rejects.toThrow(/itself/);
  });

  it("merges id2 into id1 by default, combining tags and taking the max confidence", async () => {
    runStore(tmpDir, "First node content here", { type: "fact", id: "m1", tags: "a", confidence: "0.3" });
    runStore(tmpDir, "Second node content here", { type: "fact", id: "m2", tags: "b", confidence: "0.9" });
    const spies = silence();
    await runCommand(registerMergeCommand, "merge", ["m1", "m2"], tmpDir);
    const paths = requireStore(tmpDir);
    const { requireNodeById } = await import("../src/core/node.js");
    const survivor = requireNodeById(paths, "m1");
    const absorbed = requireNodeById(paths, "m2");
    expect(survivor.frontmatter.tags?.sort()).toEqual(["a", "b"]);
    expect(survivor.frontmatter.confidence).toBe(0.9);
    expect(survivor.content).toContain("Merged from m2");
    expect(absorbed.frontmatter.status).toBe("superseded");
    expect(absorbed.frontmatter.superseded_by).toBe("m1");
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Merged"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("keeps id2 as canonical when --keep is set to id2, and handles a survivor without a heading", async () => {
    const paths = requireStore(tmpDir);
    const { writeNode, nodeFilePath } = await import("../src/core/node.js");
    writeNode(paths, {
      frontmatter: {
        id: "k1",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "No heading survivor content.",
      filePath: nodeFilePath(paths, "fact", "k1"),
    });
    writeNode(paths, {
      frontmatter: {
        id: "k2",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "# K2 Heading\n\nAbsorbed body content.",
      filePath: nodeFilePath(paths, "fact", "k2"),
    });

    const spies = silence();
    await runCommand(registerMergeCommand, "merge", ["k1", "k2", "--keep", "k2"], tmpDir);
    const { requireNodeById } = await import("../src/core/node.js");
    const survivor = requireNodeById(paths, "k2");
    const absorbed = requireNodeById(paths, "k1");
    expect(absorbed.frontmatter.status).toBe("superseded");
    expect(survivor.content).toContain("K2 Heading");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when noIndex is forced true", async () => {
    runStore(tmpDir, "Merge A content", { type: "fact", id: "ma" });
    runStore(tmpDir, "Merge B content", { type: "fact", id: "mb" });
    const paths = requireStore(tmpDir);
    const { reindexStore, readKeywordsIndex } = await import("../src/core/index.js");
    reindexStore(paths);
    fs.rmSync(paths.keywordsFile);
    const spies = silence();
    await runCommand(registerMergeCommand, "merge", ["ma", "mb"], tmpDir, { noIndex: true });
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when the manifest disables auto_index", async () => {
    runStore(tmpDir, "Merge C content", { type: "fact", id: "mc" });
    runStore(tmpDir, "Merge D content", { type: "fact", id: "md" });
    const paths = requireStore(tmpDir);
    const { reindexStore, readKeywordsIndex } = await import("../src/core/index.js");
    reindexStore(paths);
    fs.rmSync(paths.keywordsFile);
    const manifest = readManifest(paths);
    manifest.settings.auto_index = false;
    writeManifest(paths, manifest);
    const spies = silence();
    await runCommand(registerMergeCommand, "merge", ["mc", "md"], tmpDir);
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("prune command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("throws when neither --stale-days nor --low-confidence is given", async () => {
    await expect(runCommand(registerPruneCommand, "prune", [], tmpDir)).rejects.toThrow(/Specify at least one/);
  });

  it("reports no candidates when nothing matches", async () => {
    runStore(tmpDir, "A solid confident fact", { type: "fact", confidence: "0.99" });
    const spies = silence();
    await runCommand(registerPruneCommand, "prune", ["--low-confidence", "0.1"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No nodes match"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("dry-runs a single low-confidence candidate with singular wording", async () => {
    runStore(tmpDir, "A shaky guess about something", { type: "fact", confidence: "0.1", id: "shaky" });
    const spies = silence();
    await runCommand(registerPruneCommand, "prune", ["--low-confidence", "0.5", "--dry-run"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("1 node");
    expect(printed).toContain("Dry run");
    const paths = requireStore(tmpDir);
    const { nodeExists } = await import("../src/core/node.js");
    expect(nodeExists(paths, "shaky")).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("prunes multiple candidates (deleting them) with plural wording, and includes archived when asked", async () => {
    runStore(tmpDir, "Shaky guess number one about deploys", { type: "fact", confidence: "0.1", id: "shaky1" });
    runStore(tmpDir, "Shaky guess number two about deploys", { type: "fact", confidence: "0.2", id: "shaky2" });
    const paths = requireStore(tmpDir);
    const { requireNodeById, writeNode } = await import("../src/core/node.js");
    const archivedNode = requireNodeById(paths, "shaky2");
    archivedNode.frontmatter.status = "archived";
    writeNode(paths, archivedNode);

    const spies = silence();
    await runCommand(registerPruneCommand, "prune", ["--low-confidence", "0.5"], tmpDir);
    let printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("Pruned 1 node.");

    spies.log.mockClear();
    await runCommand(registerPruneCommand, "prune", ["--low-confidence", "0.5", "--include-archived"], tmpDir);
    printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    // shaky1 already deleted above; only shaky2 (archived) remains as a candidate this time.
    expect(printed).toContain("Pruned 1 node.");

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("prunes with --stale-days by rewriting an old modified timestamp", async () => {
    const paths = requireStore(tmpDir);
    const { writeNode, nodeFilePath, requireNodeById } = await import("../src/core/node.js");
    runStore(tmpDir, "An old stale fact about caches", { type: "fact", id: "stalefact" });
    const node = requireNodeById(paths, "stalefact");
    node.frontmatter.modified = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();
    writeNode(paths, node);

    const spies = silence();
    await runCommand(registerPruneCommand, "prune", ["--stale-days", "30"], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("Pruned 1 node.");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when noIndex is forced true", async () => {
    runStore(tmpDir, "Prune target for noindex test", { type: "fact", confidence: "0.05", id: "prunenoindex" });
    const paths = requireStore(tmpDir);
    const { reindexStore, readKeywordsIndex } = await import("../src/core/index.js");
    reindexStore(paths);
    fs.rmSync(paths.keywordsFile);
    const spies = silence();
    await runCommand(registerPruneCommand, "prune", ["--low-confidence", "0.5"], tmpDir, { noIndex: true });
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when the manifest disables auto_index", async () => {
    runStore(tmpDir, "Prune target for auto_index test", { type: "fact", confidence: "0.05", id: "pruneautoidx" });
    const paths = requireStore(tmpDir);
    const { reindexStore, readKeywordsIndex } = await import("../src/core/index.js");
    reindexStore(paths);
    fs.rmSync(paths.keywordsFile);
    const manifest = readManifest(paths);
    manifest.settings.auto_index = false;
    writeManifest(paths, manifest);
    const spies = silence();
    await runCommand(registerPruneCommand, "prune", ["--low-confidence", "0.5"], tmpDir);
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("distill command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("warns when there is no daily note for the date", async () => {
    const spies = silence();
    await runCommand(registerDistillCommand, "distill", ["--date", "2024-06-01"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No daily note found"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("reports already-distilled notes without reprocessing", async () => {
    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-06-02", agent: "tester", status: "distilled" },
      content: "- already done",
      filePath: dailyNotePath(paths, "2024-06-02"),
    });
    const spies = silence();
    await runCommand(registerDistillCommand, "distill", ["--date", "2024-06-02"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("already distilled"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("warns when the daily note has no bullet points, but still marks it distilled", async () => {
    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-06-03", agent: "tester", status: "pending" },
      content: "Just prose, no bullets today.",
      filePath: dailyNotePath(paths, "2024-06-03"),
    });
    const spies = silence();
    await runCommand(registerDistillCommand, "distill", ["--date", "2024-06-03"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("No bullet points found"))).toBe(true);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Distilled 0 node"))).toBe(true);
    const note = readDailyNote(paths, "2024-06-03");
    expect(note?.frontmatter.status).toBe("distilled");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("dry-runs distillation without writing nodes or marking the note distilled", async () => {
    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-06-04", agent: "tester", status: "pending" },
      content: "## Section\n\n- User prefers vim over emacs",
      filePath: dailyNotePath(paths, "2024-06-04"),
    });
    const spies = silence();
    await runCommand(registerDistillCommand, "distill", ["--date", "2024-06-04", "--dry-run"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Would distill"))).toBe(true);
    const note = readDailyNote(paths, "2024-06-04");
    expect(note?.frontmatter.status).toBe("pending");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("distills bullets into nodes, prefixing episode ids with the date, deduping id collisions, and tagging by section", async () => {
    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-06-05", agent: "tester", status: "pending" },
      content: [
        "## Deploys",
        "- We deployed the new release yesterday",
        "- We deployed the new release yesterday",
        "- The office wifi is flaky today",
      ].join("\n"),
      filePath: dailyNotePath(paths, "2024-06-05"),
    });
    const spies = silence();
    await runCommand(registerDistillCommand, "distill", ["--date", "2024-06-05"], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Distilled 3 node"))).toBe(true);

    const { listAllNodes } = await import("../src/core/node.js");
    const nodes = listAllNodes(paths);
    const episodeNodes = nodes.filter((n) => n.frontmatter.type === "episode");
    expect(episodeNodes.length).toBeGreaterThanOrEqual(1);
    expect(episodeNodes.some((n) => /^\d{4}-\d{2}-\d{2}-/.test(n.frontmatter.id))).toBe(true);
    expect(nodes.some((n) => n.frontmatter.tags?.includes("deploys"))).toBe(true);

    const note = readDailyNote(paths, "2024-06-05");
    expect(note?.frontmatter.status).toBe("distilled");

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when noIndex is forced true", async () => {
    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-06-06", agent: "tester", status: "pending" },
      content: "- A single bullet point to distill",
      filePath: dailyNotePath(paths, "2024-06-06"),
    });
    const { readKeywordsIndex } = await import("../src/core/index.js");
    const spies = silence();
    await runCommand(registerDistillCommand, "distill", ["--date", "2024-06-06"], tmpDir, { noIndex: true });
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when the manifest disables auto_index", async () => {
    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-06-07", agent: "tester", status: "pending" },
      content: "- Another bullet point to distill",
      filePath: dailyNotePath(paths, "2024-06-07"),
    });
    const manifest = readManifest(paths);
    manifest.settings.auto_index = false;
    writeManifest(paths, manifest);
    const { readKeywordsIndex } = await import("../src/core/index.js");
    const spies = silence();
    await runCommand(registerDistillCommand, "distill", ["--date", "2024-06-07"], tmpDir);
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("reindex command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("rebuilds the index and reports counts", async () => {
    runStore(tmpDir, "A linked fact pointing at [[other-node]]", { type: "fact", id: "linker" });
    const spies = silence();
    await runCommand(registerReindexCommand, "reindex", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("Reindexed store");
    expect(printed).toContain("nodes");
    expect(printed).toContain("links");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("export command", () => {
  let tmpDir: string;
  let outDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
    outDir = makeTmpDir();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
    cleanTmp(outDir);
  });

  it("exports raw amp format by copying the store directory (including nested subdirs)", async () => {
    runStore(tmpDir, "Fact for amp export", { type: "fact", id: "ampexport" });
    const output = path.join(outDir, "amp-copy");
    const spies = silence();
    await runCommand(registerExportCommand, "export", ["--format", "amp", "--output", output], tmpDir);
    expect(fs.existsSync(path.join(output, ".amp", "nodes"))).toBe(true);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Exported raw store"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("exports json (default format) with default and explicit output paths", async () => {
    runStore(tmpDir, "Fact for json export one", { type: "fact", tags: "a" });
    runStore(tmpDir, "User prefers json export two", { type: "preference" });
    const spies = silence();
    await runCommand(registerExportCommand, "export", [], tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "amp-export.json"))).toBe(true);

    const output = path.join(outDir, "custom.json");
    await runCommand(registerExportCommand, "export", ["--format", "json", "--output", output], tmpDir);
    expect(fs.existsSync(output)).toBe(true);
    const bundle = JSON.parse(fs.readFileSync(output, "utf-8"));
    expect(bundle.nodes.length).toBe(2);

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("exports markdown grouped by type, including a tags line for tagged nodes", async () => {
    runStore(tmpDir, "Fact for markdown export", { type: "fact", tags: "md" });
    runStore(tmpDir, "User prefers markdown export too", { type: "preference" });
    const output = path.join(outDir, "export.md");
    const spies = silence();
    await runCommand(registerExportCommand, "export", ["--format", "markdown", "--output", output], tmpDir);
    const content = fs.readFileSync(output, "utf-8");
    expect(content).toContain("## Facts");
    expect(content).toContain("## Preferences");
    expect(content).toContain("**tags**: md");
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Exported markdown"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("throws on an unknown export format", async () => {
    await expect(runCommand(registerExportCommand, "export", ["--format", "xml"], tmpDir)).rejects.toThrow(/Unknown export format/);
  });
});

describe("import command", () => {
  let tmpDir: string;
  let bundleDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
    bundleDir = makeTmpDir();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
    cleanTmp(bundleDir);
  });

  it("throws when the import source does not exist", async () => {
    await expect(
      runCommand(registerImportCommand, "import", [path.join(bundleDir, "missing.json")], tmpDir)
    ).rejects.toThrow(/not found/);
  });

  it("throws when the import source is not valid JSON", async () => {
    const badFile = path.join(bundleDir, "bad.json");
    fs.writeFileSync(badFile, "{not valid json", "utf-8");
    await expect(runCommand(registerImportCommand, "import", [badFile], tmpDir)).rejects.toThrow(/Failed to parse/);
  });

  it("throws when the JSON is valid but not an AMP export (missing nodes array)", async () => {
    const badFile = path.join(bundleDir, "notamp.json");
    fs.writeFileSync(badFile, JSON.stringify({ foo: "bar" }), "utf-8");
    await expect(runCommand(registerImportCommand, "import", [badFile], tmpDir)).rejects.toThrow(/does not look like/);
  });

  it("imports nodes and daily notes, skipping entries with missing id/type and existing ids without --overwrite", async () => {
    const otherStore = makeTmpStore({ name: "Source", agentId: "source" });
    runStore(otherStore, "Importable fact one about networking", { type: "fact", id: "shared-id" });
    runStore(otherStore, "Importable fact two about storage", { type: "fact" });
    const { buildExportBundle } = await import("../src/commands/export.js");
    const bundle = buildExportBundle(requireStore(otherStore));
    // Add a daily note and a malformed node entry to the bundle.
    bundle.daily.push({ frontmatter: { date: "2024-07-01", agent: "source", status: "pending" }, content: "- bullet" });
    (bundle.nodes as unknown[]).push({ frontmatter: { id: "", type: "" }, content: "broken" });
    const exportFile = path.join(bundleDir, "export.json");
    fs.writeFileSync(exportFile, JSON.stringify(bundle), "utf-8");

    // Pre-create a colliding node id in the destination store to hit the skip-existing branch.
    runStore(tmpDir, "Pre-existing fact with colliding id", { type: "fact", id: "shared-id" });

    const spies = silence();
    await runCommand(registerImportCommand, "import", [exportFile], tmpDir);
    let printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("Imported from");
    expect(printed).toContain("nodes imported");
    expect(printed).toContain("nodes skipped");
    expect(printed).toContain("daily notes imported");
    expect(printed).toContain("Use --overwrite");

    const { requireNodeById } = await import("../src/core/node.js");
    const paths = requireStore(tmpDir);
    const preserved = requireNodeById(paths, "shared-id");
    expect(preserved.content).toContain("Pre-existing");

    cleanTmp(otherStore);

    // Now re-import with --overwrite to hit the overwrite branches for both nodes and daily notes.
    spies.log.mockClear();
    await runCommand(registerImportCommand, "import", [exportFile, "--overwrite"], tmpDir);
    printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    const overwritten = requireNodeById(paths, "shared-id");
    expect(overwritten.content).toContain("networking");

    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips daily-note entries with no date", async () => {
    const bundle = {
      amp: "0.1",
      exported: new Date().toISOString(),
      manifest: readManifest(requireStore(tmpDir)),
      nodes: [],
      daily: [{ frontmatter: {}, content: "no date here" }],
    };
    const exportFile = path.join(bundleDir, "nodateimport.json");
    fs.writeFileSync(exportFile, JSON.stringify(bundle), "utf-8");
    const spies = silence();
    await runCommand(registerImportCommand, "import", [exportFile], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("nodes imported: 0"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("skips reindexing when noIndex is forced true", async () => {
    const bundle = {
      amp: "0.1",
      exported: new Date().toISOString(),
      manifest: readManifest(requireStore(tmpDir)),
      nodes: [
        {
          frontmatter: {
            id: "noidximport",
            type: "fact",
            created: "2024-01-01T00:00:00.000Z",
            modified: "2024-01-01T00:00:00.000Z",
            author: "agent:tester",
            status: "active",
          },
          content: "# Title\n\nBody",
        },
      ],
      daily: [],
    };
    const exportFile = path.join(bundleDir, "noindeximport.json");
    fs.writeFileSync(exportFile, JSON.stringify(bundle), "utf-8");
    const paths = requireStore(tmpDir);
    const { readKeywordsIndex } = await import("../src/core/index.js");
    const spies = silence();
    await runCommand(registerImportCommand, "import", [exportFile], tmpDir, { noIndex: true });
    expect(readKeywordsIndex(paths)).toBeNull();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});

describe("validate command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
    process.exitCode = undefined;
  });

  it("reports a healthy store with no issues", async () => {
    runStore(tmpDir, "A perfectly valid fact", { type: "fact" });
    const spies = silence();
    await runCommand(registerValidateCommand, "validate", [], tmpDir);
    expect(spies.log.mock.calls.some((c) => String(c[0]).includes("Store is valid"))).toBe(true);
    expect(process.exitCode).toBeUndefined();
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("reports errors and warnings in text mode and sets exitCode", async () => {
    const paths = requireStore(tmpDir);
    const { writeNode, nodeFilePath } = await import("../src/core/node.js");
    // Missing required fields + bad type/status/scope/confidence/timestamps + bad link.
    writeNode(paths, {
      frontmatter: {
        id: "bad-node",
        type: "not-a-type" as never,
        created: "not-a-date",
        modified: "not-a-date",
        author: "",
        status: "not-a-status" as never,
        scope: "not-a-scope" as never,
        confidence: 5 as never,
        links: [{ target: "", relation: "relates_to" }, { target: "ghost", relation: "bogus" as never }],
        superseded_by: "ghost",
      },
      content: "# Bad\n\nBody",
      filePath: nodeFilePath(paths, "fact", "bad-node"),
    });
    const spies = silence();
    await runCommand(registerValidateCommand, "validate", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("error");
    expect(process.exitCode).toBe(1);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("supports --json output and still sets exitCode on errors", async () => {
    const paths = requireStore(tmpDir);
    const { writeNode, nodeFilePath } = await import("../src/core/node.js");
    writeNode(paths, {
      frontmatter: {
        id: "wrong-filename",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "superseded",
      },
      content: "# X\n\nBody",
      filePath: nodeFilePath(paths, "fact", "actually-different-name"),
    });
    const spies = silence();
    await runCommand(registerValidateCommand, "validate", ["--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(process.exitCode).toBe(1);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("reports a duplicate id and a manifest parse failure", async () => {
    const paths = requireStore(tmpDir);
    fs.writeFileSync(paths.manifestFile, ": not: valid: yaml: [", "utf-8");
    const { writeNode, nodeFilePath } = await import("../src/core/node.js");
    const shared = {
      id: "dup-id",
      type: "fact" as const,
      created: "2024-01-01T00:00:00.000Z",
      modified: "2024-01-01T00:00:00.000Z",
      author: "agent:tester",
      status: "active" as const,
    };
    writeNode(paths, { frontmatter: { ...shared }, content: "# A\n\nBody", filePath: nodeFilePath(paths, "fact", "dup-id") });
    // Force a genuine duplicate id by writing straight to disk with mismatched filename/id combo avoided:
    // instead create a second physical file whose frontmatter id also equals "dup-id".
    const secondPath = path.join(paths.nodesDir, "facts", "dup-id-2.md");
    fs.writeFileSync(
      secondPath,
      `---\nid: dup-id\ntype: fact\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\nauthor: agent:tester\nstatus: active\n---\n# B\n\nOther body\n`,
      "utf-8"
    );

    const spies = silence();
    await runCommand(registerValidateCommand, "validate", ["--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed.some((i: { message: string }) => i.message.includes("Duplicate id"))).toBe(true);
    expect(parsed.some((i: { message: string }) => i.message.includes("Failed to parse manifest"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("reports a superseded node missing superseded_by as a warning", async () => {
    const paths = requireStore(tmpDir);
    const { writeNode, nodeFilePath } = await import("../src/core/node.js");
    writeNode(paths, {
      frontmatter: {
        id: "supersede-me",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "superseded",
      },
      content: "# X\n\nBody",
      filePath: nodeFilePath(paths, "fact", "supersede-me"),
    });
    const spies = silence();
    await runCommand(registerValidateCommand, "validate", ["--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed.some((i: { message: string }) => i.message.includes("superseded_by is not set"))).toBe(true);
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("propagates a parse failure for a corrupt node file", async () => {
    // Note: validateStore() calls listAllNodes(paths) up front (to build idSet)
    // before its own per-file try/catch around parseNodeFile runs, so a
    // corrupt node file throws straight out of the command rather than being
    // captured as a soft "Failed to parse:" issue.
    const paths = requireStore(tmpDir);
    const badPath = path.join(paths.nodesDir, "facts", "corrupt.md");
    fs.mkdirSync(path.dirname(badPath), { recursive: true });
    fs.writeFileSync(badPath, "---\nid: [unterminated\n", "utf-8");
    await expect(runCommand(registerValidateCommand, "validate", ["--json"], tmpDir)).rejects.toThrow();
  });
});

describe("stats command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("reports stats for an empty, unindexed store", async () => {
    const spies = silence();
    await runCommand(registerStatsCommand, "stats", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("statistics");
    expect(printed).toContain("stale");
    spies.log.mockRestore();
    spies.err.mockRestore();
  });

  it("reports full stats with scope, tags, confidence, daily notes, and a built index (--json)", async () => {
    const paths = requireStore(tmpDir);
    runStore(tmpDir, "First fact with scope and tags", { type: "fact", tags: "x,y", confidence: "0.5", scope: "team" });
    runStore(tmpDir, "Second fact with scope and tags too", { type: "fact", tags: "x", confidence: "0.9", scope: "team" });
    writeDailyNote(paths, {
      frontmatter: { date: "2024-08-01", agent: "tester", status: "pending" },
      content: "- pending bullet",
      filePath: dailyNotePath(paths, "2024-08-01"),
    });

    const spies = silence();
    await runCommand(registerStatsCommand, "stats", ["--json"], tmpDir);
    const parsed = JSON.parse(spies.log.mock.calls[0][0] as string);
    expect(parsed.totalNodes).toBe(2);
    expect(parsed.avgConfidence).toBeCloseTo(0.7);
    expect(parsed.dailyNotes).toBe(1);
    expect(parsed.pendingDailyNotes).toBe(1);
    expect(parsed.indexed).toBe(true);
    expect(parsed.topTags.length).toBeGreaterThan(0);
    expect(parsed.oldest).not.toBeNull();
    expect(parsed.newest).not.toBeNull();

    spies.log.mockClear();
    await runCommand(registerStatsCommand, "stats", [], tmpDir);
    const printed = spies.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("by scope");
    expect(printed).toContain("top tags");
    expect(printed).toContain("oldest");
    expect(printed).toContain("newest");
    expect(printed).toContain("built");

    spies.log.mockRestore();
    spies.err.mockRestore();
  });
});
