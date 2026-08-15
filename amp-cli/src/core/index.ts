/**
 * Index building: TF-IDF keyword extraction and link-graph computation.
 * Everything under .amp/index is regenerable from the node files, so this
 * module reads nodes fresh each time rather than doing incremental updates.
 */

import fs from "node:fs";
import type {
  GraphIndex,
  GraphNodeLinks,
  KeywordsIndex,
  KeywordEntry,
  MemoryNode,
  NodeLink,
} from "./types.js";
import { listAllNodes } from "./node.js";
import type { StorePaths } from "./store.js";
import { extractWikiLinks, nowIso, tokenize } from "../utils/helpers.js";

const MAX_KEYWORDS_PER_NODE = 15;

function computeTermFrequencies(terms: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const term of terms) {
    tf.set(term, (tf.get(term) ?? 0) + 1);
  }
  return tf;
}

export function buildKeywordsIndex(nodes: MemoryNode[]): KeywordsIndex {
  const perNodeTerms = new Map<string, string[]>();
  const docFrequency = new Map<string, number>();

  for (const node of nodes) {
    const tagText = (node.frontmatter.tags ?? []).join(" ");
    const text = `${node.content}\n${tagText}`;
    const terms = tokenize(text);
    perNodeTerms.set(node.frontmatter.id, terms);

    const uniqueTerms = new Set(terms);
    for (const term of uniqueTerms) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
  }

  const totalDocs = nodes.length || 1;
  const nodesOut: Record<string, KeywordEntry[]> = {};

  for (const node of nodes) {
    const terms = perNodeTerms.get(node.frontmatter.id) ?? /* v8 ignore next */ [];
    const tf = computeTermFrequencies(terms);
    const maxTf = Math.max(1, ...Array.from(tf.values()));

    const scored: KeywordEntry[] = Array.from(tf.entries()).map(([term, freq]) => {
      const normalizedTf = freq / maxTf;
      const df = docFrequency.get(term) ?? /* v8 ignore next */ 1;
      const idf = Math.log(totalDocs / df + 1) + 1;
      return { keyword: term, score: Number((normalizedTf * idf).toFixed(4)) };
    });

    scored.sort((a, b) => b.score - a.score);
    nodesOut[node.frontmatter.id] = scored.slice(0, MAX_KEYWORDS_PER_NODE);
  }

  return { generated: nowIso(), nodes: nodesOut };
}

export function buildGraphIndex(nodes: MemoryNode[]): GraphIndex {
  const graph: Record<string, GraphNodeLinks> = {};
  const validIds = new Set(nodes.map((n) => n.frontmatter.id));

  for (const node of nodes) {
    graph[node.frontmatter.id] = { outgoing: [], incoming: [] };
  }

  for (const node of nodes) {
    const id = node.frontmatter.id;
    const links: NodeLink[] = [];

    for (const link of node.frontmatter.links ?? []) {
      if (link && typeof link.target === "string") {
        links.push({ target: link.target, relation: link.relation ?? "relates_to" });
      }
    }

    for (const target of extractWikiLinks(node.content)) {
      if (!links.some((l) => l.target === target)) {
        links.push({ target, relation: "relates_to" });
      }
    }

    for (const link of links) {
      graph[id].outgoing.push(link);
      if (validIds.has(link.target)) {
        graph[link.target] ??= { outgoing: [], incoming: [] };
        graph[link.target].incoming.push({ target: id, relation: link.relation });
      }
    }
  }

  return { generated: nowIso(), nodes: graph };
}

export function writeKeywordsIndex(paths: StorePaths, index: KeywordsIndex): void {
  fs.mkdirSync(paths.indexDir, { recursive: true });
  fs.writeFileSync(paths.keywordsFile, JSON.stringify(index, null, 2), "utf-8");
}

export function writeGraphIndex(paths: StorePaths, index: GraphIndex): void {
  fs.mkdirSync(paths.indexDir, { recursive: true });
  fs.writeFileSync(paths.graphFile, JSON.stringify(index, null, 2), "utf-8");
}

export function readKeywordsIndex(paths: StorePaths): KeywordsIndex | null {
  if (!fs.existsSync(paths.keywordsFile)) return null;
  return JSON.parse(fs.readFileSync(paths.keywordsFile, "utf-8")) as KeywordsIndex;
}

export function readGraphIndex(paths: StorePaths): GraphIndex | null {
  if (!fs.existsSync(paths.graphFile)) return null;
  return JSON.parse(fs.readFileSync(paths.graphFile, "utf-8")) as GraphIndex;
}

/**
 * Rebuild both index files from the current set of nodes on disk.
 */
export function reindexStore(paths: StorePaths): { keywords: KeywordsIndex; graph: GraphIndex; nodeCount: number } {
  const nodes = listAllNodes(paths);
  const keywords = buildKeywordsIndex(nodes);
  const graph = buildGraphIndex(nodes);
  writeKeywordsIndex(paths, keywords);
  writeGraphIndex(paths, graph);
  return { keywords, graph, nodeCount: nodes.length };
}
