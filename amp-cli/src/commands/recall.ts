import { Command } from "commander";
import { listAllNodes } from "../core/node.js";
import { requireStore } from "../core/store.js";
import type { MemoryNode } from "../core/types.js";
import { tokenize, truncate } from "../utils/helpers.js";
import { chalk, colorStatus, colorType, dim, heading } from "../utils/ui.js";

interface RecallOptions {
  limit?: string;
  status?: string;
  json?: boolean;
}

export interface ScoredNode {
  node: MemoryNode;
  score: number;
  matchedTerms: string[];
}

/**
 * Score a node against a set of context query terms using simple keyword
 * overlap across the title/body content and tags, with a small boost for
 * tag matches and higher-confidence nodes.
 */
export function scoreNode(node: MemoryNode, queryTerms: string[]): ScoredNode {
  const contentTerms = new Set(tokenize(node.content));
  const tagTerms = new Set((node.frontmatter.tags ?? []).flatMap((t) => tokenize(t)));
  const idTerms = new Set(tokenize(node.frontmatter.id.replace(/-/g, " ")));

  const matched = new Set<string>();
  let score = 0;

  for (const term of queryTerms) {
    if (contentTerms.has(term)) {
      score += 1;
      matched.add(term);
    }
    if (tagTerms.has(term)) {
      score += 2;
      matched.add(term);
    }
    if (idTerms.has(term)) {
      score += 1.5;
      matched.add(term);
    }
  }

  if (queryTerms.length > 0) {
    score = score / queryTerms.length;
  }

  const confidence = node.frontmatter.confidence ?? 0.75;
  score *= 0.5 + confidence * 0.5;

  return { node, score, matchedTerms: Array.from(matched) };
}

export function recallNodes(
  nodes: MemoryNode[],
  context: string,
  opts: { status?: string; limit?: number } = {}
): ScoredNode[] {
  const queryTerms = tokenize(context);
  const filtered = nodes.filter((n) => (opts.status ? n.frontmatter.status === opts.status : n.frontmatter.status !== "redacted"));

  const scored = filtered
    .map((node) => scoreNode(node, queryTerms))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return typeof opts.limit === "number" ? scored.slice(0, opts.limit) : scored;
}

export function registerRecallCommand(program: Command): void {
  program
    .command("recall <context>")
    .description("Retrieve nodes relevant to a context string via keyword matching")
    .option("--limit <n>", "Maximum results to return", "10")
    .option("--status <status>", "Filter by status (default: exclude redacted)")
    .option("--json", "Output raw JSON", false)
    .action((context: string, options: RecallOptions) => {
      const paths = requireStore(process.cwd());
      const nodes = listAllNodes(paths);
      const limit = Number(options.limit ?? "10");
      const results = recallNodes(nodes, context, { status: options.status, limit });

      if (options.json) {
        console.log(
          JSON.stringify(
            results.map((r) => ({
              id: r.node.frontmatter.id,
              type: r.node.frontmatter.type,
              score: Number(r.score.toFixed(3)),
              matchedTerms: r.matchedTerms,
            })),
            null,
            2
          )
        );
        return;
      }

      if (results.length === 0) {
        console.log(dim(`No memories found relevant to "${context}".`));
        return;
      }

      console.log(heading(`Recalled ${results.length} memor${results.length === 1 ? "y" : "ies"} for "${context}"`));
      console.log();
      for (const { node, score, matchedTerms } of results) {
        const fm = node.frontmatter;
        console.log(
          `${chalk.bold(fm.id)}  ${colorType(fm.type)}  ${colorStatus(fm.status)}  ${dim(`score ${score.toFixed(2)}`)}`
        );
        console.log(`  ${truncate(node.content.replace(/^#.*\n/, ""), 100)}`);
        if (matchedTerms.length) {
          console.log(`  ${dim("matched:")} ${matchedTerms.join(", ")}`);
        }
        console.log();
      }
    });
}
