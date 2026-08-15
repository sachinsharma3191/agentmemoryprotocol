import { Command } from "commander";
import { listAllNodes } from "../core/node.js";
import { listDailyNotes } from "../core/daily.js";
import { readGraphIndex, readKeywordsIndex } from "../core/index.js";
import { readManifest, requireStore } from "../core/store.js";
import { chalk, dim, heading, kv } from "../utils/ui.js";

export function registerStatsCommand(program: Command): void {
  program
    .command("stats")
    .description("Show summary statistics for the store")
    .option("--json", "Output raw JSON", false)
    .action((options: { json?: boolean }) => {
      const paths = requireStore(process.cwd());
      const manifest = readManifest(paths);
      const nodes = listAllNodes(paths);
      const daily = listDailyNotes(paths);
      const graph = readGraphIndex(paths);
      const keywords = readKeywordsIndex(paths);

      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byScope: Record<string, number> = {};
      const tagCounts: Record<string, number> = {};
      let confidenceSum = 0;
      let confidenceCount = 0;

      for (const node of nodes) {
        const fm = node.frontmatter;
        byType[fm.type] = (byType[fm.type] ?? 0) + 1;
        byStatus[fm.status] = (byStatus[fm.status] ?? 0) + 1;
        if (fm.scope) byScope[fm.scope] = (byScope[fm.scope] ?? 0) + 1;
        for (const tag of fm.tags ?? []) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        if (fm.confidence !== undefined) {
          confidenceSum += fm.confidence;
          confidenceCount += 1;
        }
      }

      const sortedByCreated = [...nodes].sort((a, b) => a.frontmatter.created.localeCompare(b.frontmatter.created));
      const oldest = sortedByCreated[0];
      const newest = sortedByCreated[sortedByCreated.length - 1];

      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const linkCount = graph ? Object.values(graph.nodes).reduce((sum, n) => sum + n.outgoing.length, 0) : 0;

      const stats = {
        store: { id: manifest.store.id, name: manifest.store.name },
        totalNodes: nodes.length,
        byType,
        byStatus,
        byScope,
        avgConfidence: confidenceCount ? Number((confidenceSum / confidenceCount).toFixed(3)) : null,
        dailyNotes: daily.length,
        pendingDailyNotes: daily.filter((d) => d.frontmatter.status === "pending").length,
        links: linkCount,
        indexed: Boolean(graph && keywords),
        topTags,
        oldest: oldest ? { id: oldest.frontmatter.id, created: oldest.frontmatter.created } : null,
        newest: newest ? { id: newest.frontmatter.id, created: newest.frontmatter.created } : null,
      };

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      console.log(heading(`${manifest.store.name} — statistics`));
      console.log();
      console.log(kv("total nodes", String(stats.totalNodes)));
      console.log(kv("by type", Object.entries(byType).map(([k, v]) => `${k}=${v}`).join("  ") || dim("none")));
      console.log(kv("by status", Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join("  ") || dim("none")));
      if (Object.keys(byScope).length) {
        console.log(kv("by scope", Object.entries(byScope).map(([k, v]) => `${k}=${v}`).join("  ")));
      }
      console.log(kv("avg confidence", stats.avgConfidence !== null ? String(stats.avgConfidence) : dim("n/a")));
      console.log(kv("links", String(stats.links)));
      console.log(kv("daily notes", `${stats.dailyNotes} (${stats.pendingDailyNotes} pending)`));
      console.log(kv("index status", stats.indexed ? chalk.green("built") : chalk.yellow("stale — run amp reindex")));
      if (topTags.length) {
        console.log(kv("top tags", topTags.map(([t, c]) => `${t}(${c})`).join(", ")));
      }
      if (oldest) console.log(kv("oldest", `${oldest.frontmatter.id} (${oldest.frontmatter.created})`));
      if (newest) console.log(kv("newest", `${newest.frontmatter.id} (${newest.frontmatter.created})`));
    });
}
