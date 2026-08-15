import { Command } from "commander";
import { deleteNode, listAllNodes } from "../core/node.js";
import { appendChangelog, readManifest, requireStore } from "../core/store.js";
import { reindexStore } from "../core/index.js";
import type { MemoryNode } from "../core/types.js";
import { chalk, colorType, dim, heading, warn } from "../utils/ui.js";

interface PruneOptions {
  staleDays?: string;
  lowConfidence?: string;
  dryRun?: boolean;
  includeArchived?: boolean;
  noIndex?: boolean;
}

export interface PruneCandidate {
  node: MemoryNode;
  reasons: string[];
}

export function findPruneCandidates(
  nodes: MemoryNode[],
  opts: { staleDays?: number; lowConfidence?: number; includeArchived?: boolean }
): PruneCandidate[] {
  const now = Date.now();
  const candidates: PruneCandidate[] = [];

  for (const node of nodes) {
    const reasons: string[] = [];
    const fm = node.frontmatter;

    if (!opts.includeArchived && (fm.status === "archived" || fm.status === "superseded" || fm.status === "redacted")) {
      continue;
    }

    if (opts.staleDays !== undefined) {
      const modified = new Date(fm.modified).getTime();
      if (!Number.isNaN(modified)) {
        const ageDays = (now - modified) / (1000 * 60 * 60 * 24);
        if (ageDays >= opts.staleDays) reasons.push(`stale (${Math.floor(ageDays)}d since modified)`);
      }
    }

    if (opts.lowConfidence !== undefined && fm.confidence !== undefined) {
      if (fm.confidence < opts.lowConfidence) reasons.push(`low confidence (${fm.confidence})`);
    }

    if (reasons.length > 0) candidates.push({ node, reasons });
  }

  return candidates;
}

export function registerPruneCommand(program: Command): void {
  program
    .command("prune")
    .description("Remove stale or low-confidence nodes")
    .option("--stale-days <n>", "Prune nodes not modified in N days")
    .option("--low-confidence <f>", "Prune nodes with confidence below F (0-1)")
    .option("--include-archived", "Also consider archived/superseded/redacted nodes", false)
    .option("--dry-run", "Show what would be pruned without deleting", false)
    .option("--no-index", "Skip automatic reindexing")
    .action((options: PruneOptions) => {
      const paths = requireStore(process.cwd());
      const manifest = readManifest(paths);

      if (options.staleDays === undefined && options.lowConfidence === undefined) {
        throw new Error("Specify at least one of --stale-days or --low-confidence.");
      }

      const staleDays = options.staleDays !== undefined ? Number(options.staleDays) : undefined;
      const lowConfidence = options.lowConfidence !== undefined ? Number(options.lowConfidence) : undefined;

      const nodes = listAllNodes(paths);
      const candidates = findPruneCandidates(nodes, {
        staleDays,
        lowConfidence,
        includeArchived: options.includeArchived,
      });

      if (candidates.length === 0) {
        console.log(dim("No nodes match the prune criteria."));
        return;
      }

      console.log(heading(`${candidates.length} node${candidates.length === 1 ? "" : "s"} match prune criteria`));
      console.log();
      for (const { node, reasons } of candidates) {
        console.log(`${chalk.bold(node.frontmatter.id)}  ${colorType(node.frontmatter.type)}  ${dim(reasons.join(", "))}`);
      }

      if (options.dryRun) {
        console.log();
        console.log(warn("Dry run — no files were deleted. Re-run without --dry-run to apply."));
        return;
      }

      let deleted = 0;
      for (const { node } of candidates) {
        if (deleteNode(paths, node.frontmatter.id)) {
          appendChangelog(paths, { action: "prune", id: node.frontmatter.id });
          deleted += 1;
        }
      }

      if (options.noIndex !== true && manifest.settings.auto_index) {
        reindexStore(paths);
      }

      console.log();
      console.log(chalk.green(`Pruned ${deleted} node${deleted === 1 ? "" : "s"}.`));
    });
}
