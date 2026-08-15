import { Command } from "commander";
import { requireNodeById, writeNode } from "../core/node.js";
import { appendChangelog, readManifest, requireStore } from "../core/store.js";
import { reindexStore } from "../core/index.js";
import { nowIso } from "../utils/helpers.js";
import { chalk, kv, success } from "../utils/ui.js";

interface UpdateOptions {
  content?: string;
  tags?: string;
  confidence?: string;
  status?: string;
  addTag?: string;
  removeTag?: string;
  noIndex?: boolean;
}

export function registerUpdateCommand(program: Command): void {
  program
    .command("update <id>")
    .description("Modify an existing memory node")
    .option("--content <content>", "Replace the node's body content")
    .option("--tags <tags>", "Replace all tags (comma-separated)")
    .option("--add-tag <tag>", "Add a single tag")
    .option("--remove-tag <tag>", "Remove a single tag")
    .option("--confidence <n>", "Update confidence score (0-1)")
    .option("--status <status>", "Update status")
    .option("--no-index", "Skip automatic reindexing")
    .action((id: string, options: UpdateOptions) => {
      const paths = requireStore(process.cwd());
      const manifest = readManifest(paths);
      const node = requireNodeById(paths, id);

      const changed: string[] = [];

      if (options.content !== undefined) {
        node.content = options.content.trim().startsWith("#")
          ? options.content.trim()
          : `# ${node.content.match(/^#\s+(.+)$/m)?.[1] ?? /* v8 ignore next */ id}\n\n${options.content.trim()}`;
        changed.push("content");
      }

      if (options.tags !== undefined) {
        node.frontmatter.tags = options.tags.split(",").map((t) => t.trim()).filter(Boolean);
        changed.push("tags");
      }
      if (options.addTag) {
        const tags = new Set(node.frontmatter.tags ?? []);
        tags.add(options.addTag.trim());
        node.frontmatter.tags = Array.from(tags);
        changed.push("tags");
      }
      if (options.removeTag) {
        node.frontmatter.tags = (node.frontmatter.tags ?? []).filter((t) => t !== options.removeTag);
        changed.push("tags");
      }

      if (options.confidence !== undefined) {
        const confidence = Number(options.confidence);
        if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
          throw new Error(`--confidence must be a number between 0 and 1, got "${options.confidence}"`);
        }
        node.frontmatter.confidence = confidence;
        changed.push("confidence");
      }

      if (options.status !== undefined) {
        node.frontmatter.status = options.status as typeof node.frontmatter.status;
        changed.push("status");
      }

      if (changed.length === 0) {
        console.log(chalk.yellow("Nothing to update. Pass --content, --tags, --confidence, or --status."));
        return;
      }

      node.frontmatter.modified = nowIso();
      writeNode(paths, node);
      appendChangelog(paths, { action: "update", id, details: { changed } });

      if (options.noIndex !== true && manifest.settings.auto_index) {
        reindexStore(paths);
      }

      console.log(success(`Updated ${chalk.bold(id)}`));
      console.log(kv("changed", changed.join(", ")));
    });
}
