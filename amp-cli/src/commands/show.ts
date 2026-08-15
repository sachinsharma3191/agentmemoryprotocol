import { Command } from "commander";
import { requireNodeById } from "../core/node.js";
import { readGraphIndex } from "../core/index.js";
import { requireStore } from "../core/store.js";
import { chalk, colorStatus, colorType, dim, heading, kv } from "../utils/ui.js";

interface ShowOptions {
  json?: boolean;
}

export function registerShowCommand(program: Command): void {
  program
    .command("show <id>")
    .description("Display a node's full content and metadata")
    .option("--json", "Output raw JSON", false)
    .action((id: string, options: ShowOptions) => {
      const paths = requireStore(process.cwd());
      const node = requireNodeById(paths, id);

      if (options.json) {
        console.log(JSON.stringify({ frontmatter: node.frontmatter, content: node.content }, null, 2));
        return;
      }

      const fm = node.frontmatter;
      console.log(heading(fm.id));
      console.log(kv("type", colorType(fm.type)));
      console.log(kv("status", colorStatus(fm.status)));
      console.log(kv("created", fm.created));
      console.log(kv("modified", fm.modified));
      console.log(kv("author", fm.author));
      if (fm.source) console.log(kv("source", fm.source));
      if (fm.scope) console.log(kv("scope", fm.scope));
      if (fm.confidence !== undefined) console.log(kv("confidence", String(fm.confidence)));
      if (fm.tags?.length) console.log(kv("tags", fm.tags.join(", ")));
      if (fm.superseded_by) console.log(kv("superseded_by", fm.superseded_by));
      if (fm.ttl) console.log(kv("ttl", fm.ttl));
      if (fm.links?.length) {
        console.log(kv("links", fm.links.map((l) => `${l.target} (${l.relation})`).join(", ")));
      }

      const graph = readGraphIndex(paths);
      const backlinks = graph?.nodes[fm.id]?.incoming ?? [];
      if (backlinks.length) {
        console.log(kv("backlinks", backlinks.map((l) => `${l.target} (${l.relation})`).join(", ")));
      }

      console.log();
      console.log(chalk.dim("─".repeat(60)));
      console.log(node.content);
      console.log(chalk.dim("─".repeat(60)));
      console.log(dim(node.filePath));
    });
}
