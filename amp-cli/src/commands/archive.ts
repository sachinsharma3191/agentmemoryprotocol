import { Command } from "commander";
import { requireNodeById, writeNode } from "../core/node.js";
import { appendChangelog, readManifest, requireStore } from "../core/store.js";
import { reindexStore } from "../core/index.js";
import { nowIso } from "../utils/helpers.js";
import { chalk, success } from "../utils/ui.js";

interface ArchiveOptions {
  noIndex?: boolean;
}

export function registerArchiveCommand(program: Command): void {
  program
    .command("archive <id>")
    .description("Set a node's status to archived")
    .option("--no-index", "Skip automatic reindexing")
    .action((id: string, options: ArchiveOptions) => {
      const paths = requireStore(process.cwd());
      const manifest = readManifest(paths);
      const node = requireNodeById(paths, id);

      node.frontmatter.status = "archived";
      node.frontmatter.modified = nowIso();
      writeNode(paths, node);
      appendChangelog(paths, { action: "archive", id });

      if (options.noIndex !== true && manifest.settings.auto_index) {
        reindexStore(paths);
      }

      console.log(success(`Archived ${chalk.bold(id)}`));
    });
}
