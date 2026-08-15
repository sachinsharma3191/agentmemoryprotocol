/**
 * Reading, writing, and parsing of AMP memory nodes (markdown + YAML
 * frontmatter files).
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { glob } from "glob";
import type { MemoryNode, NodeFrontmatter, NodeType } from "./types.js";
import { NODE_TYPES, nodeTypeDir, type StorePaths } from "./store.js";

export class NodeNotFoundError extends Error {
  constructor(id: string) {
    super(`No memory node found with id "${id}".`);
    this.name = "NodeNotFoundError";
  }
}

export class DuplicateNodeError extends Error {
  constructor(id: string) {
    super(`A memory node with id "${id}" already exists.`);
    this.name = "DuplicateNodeError";
  }
}

function serialize(node: MemoryNode): string {
  return matter.stringify(node.content.trimEnd() + "\n", node.frontmatter as Record<string, unknown>);
}

export function nodeFilePath(paths: StorePaths, type: NodeType, id: string): string {
  return path.join(nodeTypeDir(paths, type), `${id}.md`);
}

export function writeNode(paths: StorePaths, node: MemoryNode): void {
  const dir = path.dirname(node.filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(node.filePath, serialize(node), "utf-8");
}

export function parseNodeFile(filePath: string): MemoryNode {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as NodeFrontmatter,
    content: parsed.content.trim(),
    filePath,
  };
}

/**
 * List every node markdown file path across all node-type directories.
 */
export function listNodeFiles(paths: StorePaths, type?: NodeType): string[] {
  const dirs = type ? [nodeTypeDir(paths, type)] : NODE_TYPES.map((t) => nodeTypeDir(paths, t));
  const files: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const matches = glob.sync("*.md", { cwd: dir, absolute: true });
    files.push(...matches);
  }
  return files.sort();
}

export function listAllNodes(paths: StorePaths, type?: NodeType): MemoryNode[] {
  return listNodeFiles(paths, type).map(parseNodeFile);
}

export function findNodeById(paths: StorePaths, id: string): MemoryNode | null {
  for (const file of listNodeFiles(paths)) {
    const base = path.basename(file, ".md");
    if (base === id) {
      return parseNodeFile(file);
    }
  }
  return null;
}

export function requireNodeById(paths: StorePaths, id: string): MemoryNode {
  const node = findNodeById(paths, id);
  if (!node) throw new NodeNotFoundError(id);
  return node;
}

export function nodeExists(paths: StorePaths, id: string): boolean {
  return findNodeById(paths, id) !== null;
}

export function deleteNode(paths: StorePaths, id: string): boolean {
  const node = findNodeById(paths, id);
  if (!node) return false;
  fs.unlinkSync(node.filePath);
  return true;
}
