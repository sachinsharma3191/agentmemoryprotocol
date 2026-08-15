import { Command } from "commander";
import { reindexStore } from "../core/index.js";
import { requireStore } from "../core/store.js";
import { kv, success } from "../utils/ui.js";

export function registerReindexCommand(program: Command): void {
  program
    .command("reindex")
    .description("Rebuild index/keywords.json and index/graph.json from the current nodes")
    .action(() => {
      const paths = requireStore(process.cwd());
      const { nodeCount, graph } = reindexStore(paths);
      const linkCount = Object.values(graph.nodes).reduce((sum, n) => sum + n.outgoing.length, 0);

      console.log(success("Reindexed store"));
      console.log(kv("nodes", String(nodeCount)));
      console.log(kv("links", String(linkCount)));
    });
}
