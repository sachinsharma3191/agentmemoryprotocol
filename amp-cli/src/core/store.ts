/**
 * Store discovery and manifest handling for AMP stores.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { ChangelogEntry, NodeType, StoreManifest } from "./types.js";
import { nowIso } from "../utils/helpers.js";

export const AMP_DIR_NAME = ".amp";
export const MANIFEST_FILE = "amp.yaml";

export const NODE_TYPES: NodeType[] = [
  "fact",
  "episode",
  "preference",
  "procedure",
  "reflection",
  "relation",
];

export class StoreNotFoundError extends Error {
  constructor() {
    super(
      'No AMP store found. Run "amp init" to create one, or run this command from within a directory containing an ".amp" store.'
    );
    this.name = "StoreNotFoundError";
  }
}

export interface StorePaths {
  root: string; // directory containing .amp
  ampDir: string; // .amp
  manifestFile: string; // .amp/amp.yaml
  nodesDir: string; // .amp/nodes
  dailyDir: string; // .amp/daily
  indexDir: string; // .amp/index
  embeddingsDir: string; // .amp/index/embeddings
  historyDir: string; // .amp/.history
  changelogFile: string; // .amp/.history/changelog.jsonl
  keywordsFile: string; // .amp/index/keywords.json
  graphFile: string; // .amp/index/graph.json
}

export function nodeTypeDir(paths: StorePaths, type: NodeType): string {
  // "relation" nodes are stored alongside facts by default since there is
  // no dedicated directory called out in the spec beyond the five listed;
  // we still support it by giving it its own folder for forward-compat.
  return path.join(paths.nodesDir, `${type}s`);
}

export function buildStorePaths(root: string): StorePaths {
  const ampDir = path.join(root, AMP_DIR_NAME);
  const indexDir = path.join(ampDir, "index");
  const historyDir = path.join(ampDir, ".history");
  return {
    root,
    ampDir,
    manifestFile: path.join(ampDir, MANIFEST_FILE),
    nodesDir: path.join(ampDir, "nodes"),
    dailyDir: path.join(ampDir, "daily"),
    indexDir,
    embeddingsDir: path.join(indexDir, "embeddings"),
    historyDir,
    changelogFile: path.join(historyDir, "changelog.jsonl"),
    keywordsFile: path.join(indexDir, "keywords.json"),
    graphFile: path.join(indexDir, "graph.json"),
  };
}

/**
 * Walk upward from `startDir` looking for a ".amp" directory.
 */
export function findStoreRoot(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, AMP_DIR_NAME);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireStore(startDir: string = process.cwd()): StorePaths {
  const root = findStoreRoot(startDir);
  if (!root) throw new StoreNotFoundError();
  return buildStorePaths(root);
}

export function readManifest(paths: StorePaths): StoreManifest {
  const raw = fs.readFileSync(paths.manifestFile, "utf-8");
  const manifest = yaml.load(raw) as StoreManifest;
  return manifest;
}

export function writeManifest(paths: StorePaths, manifest: StoreManifest): void {
  const raw = yaml.dump(manifest, { lineWidth: 100 });
  fs.writeFileSync(paths.manifestFile, raw, "utf-8");
}

export function ensureStoreLayout(paths: StorePaths): void {
  fs.mkdirSync(paths.ampDir, { recursive: true });
  fs.mkdirSync(paths.nodesDir, { recursive: true });
  for (const type of NODE_TYPES) {
    fs.mkdirSync(nodeTypeDir(paths, type), { recursive: true });
  }
  fs.mkdirSync(paths.dailyDir, { recursive: true });
  fs.mkdirSync(paths.indexDir, { recursive: true });
  fs.mkdirSync(paths.embeddingsDir, { recursive: true });
  fs.mkdirSync(paths.historyDir, { recursive: true });
  if (!fs.existsSync(paths.changelogFile)) {
    fs.writeFileSync(paths.changelogFile, "", "utf-8");
  }
}

export function appendChangelog(paths: StorePaths, entry: Omit<ChangelogEntry, "timestamp">): void {
  const full: ChangelogEntry = { timestamp: nowIso(), ...entry };
  fs.mkdirSync(paths.historyDir, { recursive: true });
  fs.appendFileSync(paths.changelogFile, JSON.stringify(full) + "\n", "utf-8");
}

export function readChangelog(paths: StorePaths): ChangelogEntry[] {
  if (!fs.existsSync(paths.changelogFile)) return [];
  const raw = fs.readFileSync(paths.changelogFile, "utf-8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as ChangelogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is ChangelogEntry => e !== null);
}
