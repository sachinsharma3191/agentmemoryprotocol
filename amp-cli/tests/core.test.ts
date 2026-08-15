import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AMP_DIR_NAME,
  StoreNotFoundError,
  appendChangelog,
  buildStorePaths,
  ensureStoreLayout,
  findStoreRoot,
  readChangelog,
  readManifest,
  requireStore,
  writeManifest,
} from "../src/core/store.js";
import {
  DuplicateNodeError,
  NodeNotFoundError,
  deleteNode,
  findNodeById,
  listAllNodes,
  listNodeFiles,
  nodeExists,
  nodeFilePath,
  parseNodeFile,
  requireNodeById,
  writeNode,
} from "../src/core/node.js";
import {
  buildGraphIndex,
  buildKeywordsIndex,
  reindexStore,
  readGraphIndex,
  readKeywordsIndex,
} from "../src/core/index.js";
import {
  dailyNotePath,
  extractBulletPoints,
  listDailyNotes,
  readDailyNote,
  writeDailyNote,
} from "../src/core/daily.js";
import type { MemoryNode } from "../src/core/types.js";
import { runInit } from "../src/commands/init.js";
import { runStore } from "../src/commands/store.js";
import { makeTmpDir, makeTmpStore, cleanTmp } from "./testUtils.js";

describe("core/store.ts", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("findStoreRoot returns null when no .amp directory exists up the tree", () => {
    // A fresh temp dir with no .amp anywhere above it (within reason).
    expect(findStoreRoot(tmpDir)).toBeNull();
  });

  it("findStoreRoot finds a store from a nested subdirectory", () => {
    runInit(tmpDir, { name: "Nested", agentId: "a" });
    const nested = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });
    expect(findStoreRoot(nested)).toBe(tmpDir);
  });

  it("requireStore throws StoreNotFoundError with a helpful message", () => {
    expect(() => requireStore(tmpDir)).toThrow(StoreNotFoundError);
    try {
      requireStore(tmpDir);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe("StoreNotFoundError");
      expect((err as Error).message).toContain("amp init");
    }
  });

  it("buildStorePaths derives all nested paths from a root", () => {
    const paths = buildStorePaths(tmpDir);
    expect(paths.ampDir).toBe(path.join(tmpDir, AMP_DIR_NAME));
    expect(paths.nodesDir.startsWith(paths.ampDir)).toBe(true);
    expect(paths.keywordsFile.endsWith("keywords.json")).toBe(true);
    expect(paths.graphFile.endsWith("graph.json")).toBe(true);
  });

  it("writeManifest + readManifest round-trip", () => {
    runInit(tmpDir, { name: "Round Trip", agentId: "a" });
    const paths = requireStore(tmpDir);
    const manifest = readManifest(paths);
    manifest.store.name = "Renamed";
    writeManifest(paths, manifest);
    expect(readManifest(paths).store.name).toBe("Renamed");
  });

  it("appendChangelog creates the history dir on demand and readChangelog parses entries", () => {
    runInit(tmpDir, { name: "Changelog", agentId: "a" });
    const paths = requireStore(tmpDir);
    fs.rmSync(paths.historyDir, { recursive: true, force: true });
    appendChangelog(paths, { action: "store", id: "x" });
    const entries = readChangelog(paths);
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe("store");
  });

  it("readChangelog returns [] when the changelog file does not exist", () => {
    const paths = buildStorePaths(tmpDir);
    expect(readChangelog(paths)).toEqual([]);
  });

  it("readChangelog skips malformed JSON lines", () => {
    runInit(tmpDir, { name: "Malformed", agentId: "a" });
    const paths = requireStore(tmpDir);
    fs.appendFileSync(paths.changelogFile, "not json\n{\"timestamp\":\"t\",\"action\":\"store\",\"id\":\"ok\"}\n\n", "utf-8");
    const entries = readChangelog(paths);
    expect(entries.some((e) => e.id === "ok")).toBe(true);
    expect(entries.length).toBe(1);
  });

  it("ensureStoreLayout is idempotent and does not clobber an existing changelog file", () => {
    runInit(tmpDir, { name: "Idempotent", agentId: "a" });
    const paths = requireStore(tmpDir);
    appendChangelog(paths, { action: "store", id: "y" });
    ensureStoreLayout(paths);
    const entries = readChangelog(paths);
    expect(entries.length).toBe(1);
  });
});

describe("core/node.ts", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("NodeNotFoundError and DuplicateNodeError carry descriptive messages", () => {
    const notFound = new NodeNotFoundError("missing-id");
    expect(notFound.name).toBe("NodeNotFoundError");
    expect(notFound.message).toContain("missing-id");

    const duplicate = new DuplicateNodeError("dupe-id");
    expect(duplicate.name).toBe("DuplicateNodeError");
    expect(duplicate.message).toContain("dupe-id");
  });

  it("requireNodeById throws NodeNotFoundError for a missing id", () => {
    const paths = requireStore(tmpDir);
    expect(() => requireNodeById(paths, "does-not-exist")).toThrow(NodeNotFoundError);
  });

  it("nodeExists reflects presence on disk", () => {
    const paths = requireStore(tmpDir);
    expect(nodeExists(paths, "nope")).toBe(false);
    runStore(tmpDir, "A fact to check existence", { type: "fact", id: "exists-check" });
    expect(nodeExists(paths, "exists-check")).toBe(true);
  });

  it("deleteNode returns false when the node does not exist and true when it deletes successfully", () => {
    const paths = requireStore(tmpDir);
    expect(deleteNode(paths, "ghost")).toBe(false);
    runStore(tmpDir, "A fact to delete", { type: "fact", id: "deletable" });
    expect(deleteNode(paths, "deletable")).toBe(true);
    expect(nodeExists(paths, "deletable")).toBe(false);
  });

  it("listNodeFiles filters by type and skips directories that do not exist", () => {
    const emptyPaths = buildStorePaths(makeTmpDir());
    expect(listNodeFiles(emptyPaths)).toEqual([]);

    const paths = requireStore(tmpDir);
    runStore(tmpDir, "A fact", { type: "fact", id: "fact-one" });
    runStore(tmpDir, "A preference", { type: "preference", id: "pref-one" });

    const allFiles = listNodeFiles(paths);
    expect(allFiles.length).toBe(2);

    const factFiles = listNodeFiles(paths, "fact");
    expect(factFiles.length).toBe(1);
    expect(factFiles[0]).toContain("fact-one");
  });

  it("parseNodeFile round-trips frontmatter and content via writeNode", () => {
    const paths = requireStore(tmpDir);
    const filePath = nodeFilePath(paths, "fact", "roundtrip");
    const node: MemoryNode = {
      frontmatter: {
        id: "roundtrip",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "# Roundtrip\n\nSome content.",
      filePath,
    };
    writeNode(paths, node);
    const parsed = parseNodeFile(filePath);
    expect(parsed.frontmatter.id).toBe("roundtrip");
    expect(parsed.content).toContain("Some content.");
  });

  it("findNodeById returns null when nothing matches", () => {
    const paths = requireStore(tmpDir);
    expect(findNodeById(paths, "totally-absent")).toBeNull();
  });

  it("listAllNodes returns an empty array for a store with no nodes", () => {
    const paths = requireStore(tmpDir);
    expect(listAllNodes(paths)).toEqual([]);
  });
});

describe("core/index.ts", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("buildKeywordsIndex handles an empty node list without dividing by zero", () => {
    const index = buildKeywordsIndex([]);
    expect(index.nodes).toEqual({});
  });

  it("buildKeywordsIndex handles nodes without tags", () => {
    const paths = requireStore(tmpDir);
    runStore(tmpDir, "Untagged fact about servers and networking", { type: "fact" });
    const nodes = listAllNodes(paths);
    const index = buildKeywordsIndex(nodes);
    expect(Object.keys(index.nodes).length).toBe(1);
  });

  it("buildGraphIndex links explicit frontmatter links, defaults missing relation, and dedupes wiki-links", () => {
    const paths = requireStore(tmpDir);
    const targetPath = nodeFilePath(paths, "fact", "target-node");
    writeNode(paths, {
      frontmatter: {
        id: "target-node",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
      },
      content: "# Target\n\nA target node.",
      filePath: targetPath,
    });

    const sourcePath = nodeFilePath(paths, "fact", "source-node");
    writeNode(paths, {
      frontmatter: {
        id: "source-node",
        type: "fact",
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        author: "agent:tester",
        status: "active",
        // relation omitted on purpose to hit the `?? "relates_to"` default,
        // and this link target duplicates a [[wiki-link]] below to hit the
        // wiki-link dedup branch.
        links: [{ target: "target-node" } as unknown as { target: string; relation: "relates_to" }],
      },
      content: "# Source\n\nLinks to [[target-node]] and also [[missing-node]].",
      filePath: sourcePath,
    });

    const nodes = listAllNodes(paths);
    const graph = buildGraphIndex(nodes);

    // explicit link + wiki-link to the same target should be deduped to one outgoing link
    const outgoingTargets = graph.nodes["source-node"].outgoing.map((l) => l.target).sort();
    expect(outgoingTargets).toEqual(["missing-node", "target-node"]);
    expect(graph.nodes["source-node"].outgoing.find((l) => l.target === "target-node")?.relation).toBe("relates_to");

    // valid target gets a backlink; invalid target ([[missing-node]]) does not appear as a graph key
    expect(graph.nodes["target-node"].incoming.some((l) => l.target === "source-node")).toBe(true);
    expect(graph.nodes["missing-node"]).toBeUndefined();
  });

  it("reindexStore writes both index files and readKeywordsIndex/readGraphIndex return null before that", () => {
    const paths = requireStore(tmpDir);
    expect(readKeywordsIndex(paths)).toBeNull();
    expect(readGraphIndex(paths)).toBeNull();
    reindexStore(paths);
    expect(readKeywordsIndex(paths)).not.toBeNull();
    expect(readGraphIndex(paths)).not.toBeNull();
  });
});

describe("core/daily.ts", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpStore();
  });

  afterEach(() => {
    cleanTmp(tmpDir);
  });

  it("readDailyNote returns null when the file does not exist", () => {
    const paths = requireStore(tmpDir);
    expect(readDailyNote(paths, "2024-01-01")).toBeNull();
  });

  it("writeDailyNote + readDailyNote round-trip", () => {
    const paths = requireStore(tmpDir);
    const filePath = dailyNotePath(paths, "2024-02-02");
    writeDailyNote(paths, {
      frontmatter: { date: "2024-02-02", agent: "tester", status: "pending" },
      content: "## Notes\n\n- Did a thing\n- Learned another thing",
      filePath,
    });
    const note = readDailyNote(paths, "2024-02-02");
    expect(note).not.toBeNull();
    expect(note?.content).toContain("Did a thing");
  });

  it("listDailyNotes returns [] when the daily dir is missing and lists sorted notes otherwise", () => {
    const emptyPaths = buildStorePaths(makeTmpDir());
    expect(listDailyNotes(emptyPaths)).toEqual([]);

    const paths = requireStore(tmpDir);
    writeDailyNote(paths, {
      frontmatter: { date: "2024-03-02", agent: "tester", status: "pending" },
      content: "- b note",
      filePath: dailyNotePath(paths, "2024-03-02"),
    });
    writeDailyNote(paths, {
      frontmatter: { date: "2024-03-01", agent: "tester", status: "pending" },
      content: "- a note",
      filePath: dailyNotePath(paths, "2024-03-01"),
    });
    const notes = listDailyNotes(paths);
    expect(notes.length).toBe(2);
    expect(notes[0].frontmatter.date).toBe("2024-03-01");
    expect(notes[1].frontmatter.date).toBe("2024-03-02");
  });

  it("extractBulletPoints tracks the nearest heading as section context and ignores non-bullet lines", () => {
    const content = [
      "# Title",
      "",
      "Some intro paragraph, not a bullet.",
      "",
      "## Section A",
      "- first bullet",
      "* second bullet",
      "",
      "### Section B",
      "-    trimmed bullet   ",
      "- ",
    ].join("\n");

    const bullets = extractBulletPoints(content);
    expect(bullets).toEqual([
      { text: "first bullet", section: "Section A" },
      { text: "second bullet", section: "Section A" },
      { text: "trimmed bullet", section: "Section B" },
    ]);
  });

  it("extractBulletPoints returns [] for content with no bullets", () => {
    expect(extractBulletPoints("Just a paragraph.\nAnother line.")).toEqual([]);
  });
});
