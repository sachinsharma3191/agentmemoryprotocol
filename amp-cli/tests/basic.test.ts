import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateIdFromContent, slugify, tokenize } from "../src/utils/helpers.js";
import { classifyContent, runStore } from "../src/commands/store.js";
import { runInit } from "../src/commands/init.js";
import { requireStore, readManifest, findStoreRoot } from "../src/core/store.js";
import { listAllNodes, findNodeById, writeNode } from "../src/core/node.js";
import { recallNodes } from "../src/commands/recall.js";
import { searchNodes } from "../src/commands/search.js";
import { reindexStore, readKeywordsIndex, readGraphIndex } from "../src/core/index.js";
import { validateStore } from "../src/commands/validate.js";
import { findPruneCandidates } from "../src/commands/prune.js";
import { buildExportBundle } from "../src/commands/export.js";

describe("helpers", () => {
  it("slugify produces kebab-case", () => {
    expect(slugify("Hello, World! It's Great")).toBe("hello-world-its-great");
  });

  it("generateIdFromContent drops stopwords and truncates", () => {
    const id = generateIdFromContent("The user always prefers to deploy on Fridays because reasons");
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(id.split("-").length).toBeLessThanOrEqual(6);
  });

  it("tokenize removes stopwords and punctuation", () => {
    const tokens = tokenize("The Quick, brown fox jumps!");
    expect(tokens).not.toContain("the");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
  });
});

describe("classifyContent", () => {
  it("classifies preferences", () => {
    expect(classifyContent("User prefers Python for backend work")).toBe("preference");
  });
  it("classifies episodes", () => {
    expect(classifyContent("We deployed the new service yesterday")).toBe("episode");
  });
  it("classifies reflections", () => {
    expect(classifyContent("Always run tests before merging, never skip CI")).toBe("reflection");
  });
  it("classifies procedures", () => {
    expect(classifyContent("How to deploy: first, build the image, then push it")).toBe("procedure");
  });
  it("defaults to fact", () => {
    expect(classifyContent("The service runs on port 8080")).toBe("fact");
  });
});

describe("end-to-end store workflow", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "amp-cli-test-"));
    runInit(tmpDir, { name: "Test Store", agentId: "tester" });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a store with a valid manifest", () => {
    const root = findStoreRoot(tmpDir);
    expect(root).toBe(tmpDir);
    const paths = requireStore(tmpDir);
    const manifest = readManifest(paths);
    expect(manifest.store.name).toBe("Test Store");
    expect(manifest.agent.id).toBe("tester");
    expect(manifest.settings.default_scope).toBe("agent");
  });

  it("stores a node with an auto-generated id and inferred type", () => {
    const node = runStore(tmpDir, "User prefers dark mode in all editors", {});
    expect(node.frontmatter.type).toBe("preference");
    expect(node.frontmatter.id).toMatch(/^[a-z0-9-]+$/);
    expect(fs.existsSync(node.filePath)).toBe(true);
  });

  it("stores a node with explicit type, tags, and confidence", () => {
    const node = runStore(tmpDir, "API rate limit is 1000 req/min", {
      type: "fact",
      tags: "api, limits",
      confidence: "0.9",
    });
    expect(node.frontmatter.type).toBe("fact");
    expect(node.frontmatter.tags).toEqual(["api", "limits"]);
    expect(node.frontmatter.confidence).toBe(0.9);
  });

  it("rejects invalid confidence values", () => {
    expect(() => runStore(tmpDir, "Some fact here", { confidence: "5" })).toThrow();
  });

  it("prefixes episode ids with the date", () => {
    const node = runStore(tmpDir, "We shipped version 2.0 today", { type: "episode" });
    expect(node.frontmatter.id).toMatch(/^\d{4}-\d{2}-\d{2}-/);
  });

  it("disambiguates duplicate ids", () => {
    const a = runStore(tmpDir, "Deploys happen on Friday", { type: "fact", id: "dupe" });
    const b = runStore(tmpDir, "Different content entirely", { type: "fact", id: "dupe" });
    expect(a.frontmatter.id).toBe("dupe");
    expect(b.frontmatter.id).toBe("dupe-2");
  });

  it("lists and shows stored nodes", () => {
    runStore(tmpDir, "The team uses TypeScript for the backend", { type: "fact", tags: "stack" });
    const paths = requireStore(tmpDir);
    const nodes = listAllNodes(paths);
    expect(nodes.length).toBe(1);
    const found = findNodeById(paths, nodes[0].frontmatter.id);
    expect(found).not.toBeNull();
    expect(found?.content).toContain("TypeScript");
  });

  it("recalls relevant nodes via keyword overlap", () => {
    runStore(tmpDir, "User prefers Python for backend services", { type: "preference", tags: "python" });
    runStore(tmpDir, "The office wifi password rotates monthly", { type: "fact" });
    const paths = requireStore(tmpDir);
    const nodes = listAllNodes(paths);
    const results = recallNodes(nodes, "what language does the user like for backend");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].node.frontmatter.tags).toContain("python");
  });

  it("searches with type/tag/status filters", () => {
    runStore(tmpDir, "User prefers vim over emacs", { type: "preference", tags: "editor" });
    runStore(tmpDir, "Server restarted after crash", { type: "episode" });
    const paths = requireStore(tmpDir);
    const nodes = listAllNodes(paths);

    const byType = searchNodes(nodes, "", { type: "preference" });
    expect(byType.length).toBe(1);
    expect(byType[0].frontmatter.type).toBe("preference");

    const byTag = searchNodes(nodes, "", { tag: "editor" });
    expect(byTag.length).toBe(1);
  });

  it("reindexes and produces keywords + graph artifacts", () => {
    runStore(tmpDir, "The deploy pipeline uses GitHub Actions", { type: "fact", tags: "ci" });
    const paths = requireStore(tmpDir);
    reindexStore(paths);
    const keywords = readKeywordsIndex(paths);
    const graph = readGraphIndex(paths);
    expect(keywords).not.toBeNull();
    expect(graph).not.toBeNull();
    expect(Object.keys(keywords!.nodes).length).toBe(1);
  });

  it("finds prune candidates by low confidence", () => {
    runStore(tmpDir, "This is a shaky guess about deployment cadence", {
      type: "fact",
      confidence: "0.1",
    });
    runStore(tmpDir, "This is a solid confirmed fact", { type: "fact", confidence: "0.95" });
    const paths = requireStore(tmpDir);
    const nodes = listAllNodes(paths);
    const candidates = findPruneCandidates(nodes, { lowConfidence: 0.5 });
    expect(candidates.length).toBe(1);
    expect(candidates[0].node.frontmatter.confidence).toBe(0.1);
  });

  it("validates a healthy store with no issues", () => {
    runStore(tmpDir, "The service runs on port 8080", { type: "fact" });
    const paths = requireStore(tmpDir);
    const issues = validateStore(paths);
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("flags a broken link target as a validation warning", () => {
    runStore(tmpDir, "Depends on a node that does not exist", {
      type: "fact",
      id: "broken-link-node",
    });
    const paths = requireStore(tmpDir);
    const node = findNodeById(paths, "broken-link-node")!;
    node.frontmatter.links = [{ target: "does-not-exist", relation: "depends_on" }];
    writeNode(paths, node);

    const issues = validateStore(paths);
    expect(issues.some((i) => i.message.includes("does-not-exist"))).toBe(true);
  });

  it("builds an export bundle containing stored nodes", () => {
    runStore(tmpDir, "Exportable fact about the system", { type: "fact" });
    const paths = requireStore(tmpDir);
    const bundle = buildExportBundle(paths);
    expect(bundle.nodes.length).toBe(1);
    expect(bundle.manifest.store.name).toBe("Test Store");
  });
});
