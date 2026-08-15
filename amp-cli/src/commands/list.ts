import { Command } from "commander";
import { listAllNodes } from "../core/node.js";
import { requireStore } from "../core/store.js";
import type { NodeStatus, NodeType } from "../core/types.js";
import { truncate } from "../utils/helpers.js";
import { chalk, colorStatus, colorType, dim, heading } from "../utils/ui.js";

interface ListOptions {
  type?: string;
  status?: string;
  tag?: string;
  json?: boolean;
  sort?: string;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List memory nodes with optional filters")
    .option("--type <type>", "Filter by node type")
    .option("--status <status>", "Filter by status")
    .option("--tag <tag>", "Filter by tag")
    .option("--sort <field>", "Sort by: created|modified|id (default: modified)", "modified")
    .option("--json", "Output raw JSON", false)
    .action((options: ListOptions) => {
      const paths = requireStore(process.cwd());
      let nodes = listAllNodes(paths);

      if (options.type) nodes = nodes.filter((n) => n.frontmatter.type === (options.type as NodeType));
      if (options.status) nodes = nodes.filter((n) => n.frontmatter.status === (options.status as NodeStatus));
      if (options.tag) nodes = nodes.filter((n) => (n.frontmatter.tags ?? []).includes(options.tag!));

      const sortField = options.sort ?? "modified";
      nodes.sort((a, b) => {
        if (sortField === "id") return a.frontmatter.id.localeCompare(b.frontmatter.id);
        if (sortField === "created") return (b.frontmatter.created ?? "").localeCompare(a.frontmatter.created ?? "");
        return (b.frontmatter.modified ?? "").localeCompare(a.frontmatter.modified ?? "");
      });

      if (options.json) {
        console.log(
          JSON.stringify(
            nodes.map((n) => ({
              id: n.frontmatter.id,
              type: n.frontmatter.type,
              status: n.frontmatter.status,
              tags: n.frontmatter.tags ?? [],
              created: n.frontmatter.created,
              modified: n.frontmatter.modified,
              confidence: n.frontmatter.confidence,
            })),
            null,
            2
          )
        );
        return;
      }

      if (nodes.length === 0) {
        console.log(dim("No nodes found."));
        return;
      }

      console.log(heading(`${nodes.length} node${nodes.length === 1 ? "" : "s"}`));
      console.log();
      for (const node of nodes) {
        const fm = node.frontmatter;
        const confidence = fm.confidence !== undefined ? dim(` (${fm.confidence})`) : "";
        console.log(`${chalk.bold(fm.id)}  ${colorType(fm.type)}  ${colorStatus(fm.status)}${confidence}`);
        console.log(`  ${truncate(node.content.replace(/^#.*\n/, ""), 90)}`);
        if (fm.tags?.length) console.log(`  ${dim("tags:")} ${fm.tags.join(", ")}`);
      }
    });
}
