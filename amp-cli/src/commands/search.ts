import { Command } from "commander";
import { listAllNodes } from "../core/node.js";
import { requireStore } from "../core/store.js";
import type { MemoryNode, NodeStatus, NodeType } from "../core/types.js";
import { tokenize, truncate } from "../utils/helpers.js";
import { chalk, colorStatus, colorType, dim, heading } from "../utils/ui.js";

interface SearchOptions {
  type?: string;
  status?: string;
  tag?: string;
  since?: string;
  json?: boolean;
  limit?: string;
}

export interface SearchFilters {
  type?: NodeType;
  status?: NodeStatus;
  tag?: string;
  since?: Date;
}

export function matchesFilters(node: MemoryNode, filters: SearchFilters): boolean {
  const fm = node.frontmatter;
  if (filters.type && fm.type !== filters.type) return false;
  if (filters.status && fm.status !== filters.status) return false;
  if (filters.tag && !(fm.tags ?? []).includes(filters.tag)) return false;
  if (filters.since) {
    const created = new Date(fm.created);
    if (Number.isNaN(created.getTime()) || created < filters.since) return false;
  }
  return true;
}

export function searchNodes(nodes: MemoryNode[], query: string, filters: SearchFilters): MemoryNode[] {
  const terms = tokenize(query);
  const queryLower = query.toLowerCase().trim();

  return nodes
    .filter((n) => matchesFilters(n, filters))
    .filter((n) => {
      if (!queryLower) return true;
      const haystack = `${n.frontmatter.id} ${n.content} ${(n.frontmatter.tags ?? []).join(" ")}`.toLowerCase();
      if (haystack.includes(queryLower)) return true;
      const docTerms = new Set(tokenize(haystack));
      return terms.some((t) => docTerms.has(t));
    });
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Search memory nodes with optional filters")
    .option("--type <type>", "Filter by node type")
    .option("--status <status>", "Filter by status")
    .option("--tag <tag>", "Filter by tag")
    .option("--since <date>", "Only nodes created on/after this ISO date")
    .option("--limit <n>", "Maximum results", "20")
    .option("--json", "Output raw JSON", false)
    .action((query: string, options: SearchOptions) => {
      const paths = requireStore(process.cwd());
      const nodes = listAllNodes(paths);

      const filters: SearchFilters = {
        type: options.type as NodeType | undefined,
        status: options.status as NodeStatus | undefined,
        tag: options.tag,
        since: options.since ? new Date(options.since) : undefined,
      };

      if (options.since && filters.since && Number.isNaN(filters.since.getTime())) {
        throw new Error(`Invalid --since date: "${options.since}"`);
      }

      let results = searchNodes(nodes, query, filters);
      const limit = Number(options.limit ?? "20");
      if (!Number.isNaN(limit)) results = results.slice(0, limit);

      if (options.json) {
        console.log(
          JSON.stringify(
            results.map((n) => ({
              id: n.frontmatter.id,
              type: n.frontmatter.type,
              status: n.frontmatter.status,
              tags: n.frontmatter.tags ?? [],
              created: n.frontmatter.created,
            })),
            null,
            2
          )
        );
        return;
      }

      if (results.length === 0) {
        console.log(dim(`No matches for "${query}".`));
        return;
      }

      console.log(heading(`Found ${results.length} node${results.length === 1 ? "" : "s"} matching "${query}"`));
      console.log();
      for (const node of results) {
        const fm = node.frontmatter;
        console.log(`${chalk.bold(fm.id)}  ${colorType(fm.type)}  ${colorStatus(fm.status)}`);
        console.log(`  ${truncate(node.content.replace(/^#.*\n/, ""), 100)}`);
        if (fm.tags?.length) console.log(`  ${dim("tags:")} ${fm.tags.join(", ")}`);
        console.log();
      }
    });
}
