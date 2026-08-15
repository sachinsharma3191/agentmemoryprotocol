import fs from "node:fs";
import { Command } from "commander";
import { nodeFilePath, nodeExists, writeNode } from "../core/node.js";
import { writeDailyNote, dailyNotePath } from "../core/daily.js";
import { appendChangelog, requireStore } from "../core/store.js";
import { reindexStore } from "../core/index.js";
import type { ExportBundle } from "./export.js";
import { chalk, dim, kv, success, warn } from "../utils/ui.js";

interface ImportOptions {
  overwrite?: boolean;
  noIndex?: boolean;
}

export function registerImportCommand(program: Command): void {
  program
    .command("import <source>")
    .description("Import nodes and daily notes from a JSON export file")
    .option("--overwrite", "Overwrite existing nodes with the same id", false)
    .option("--no-index", "Skip automatic reindexing")
    .action((source: string, options: ImportOptions) => {
      const paths = requireStore(process.cwd());

      if (!fs.existsSync(source)) {
        throw new Error(`Import source not found: ${source}`);
      }

      const raw = fs.readFileSync(source, "utf-8");
      let bundle: ExportBundle;
      try {
        bundle = JSON.parse(raw) as ExportBundle;
      } catch (err) {
        throw new Error(`Failed to parse "${source}" as JSON: ${(err as Error).message}`);
      }

      if (!Array.isArray(bundle.nodes)) {
        throw new Error(`"${source}" does not look like an AMP JSON export (missing "nodes" array).`);
      }

      let imported = 0;
      let skipped = 0;

      for (const entry of bundle.nodes) {
        const id = entry.frontmatter.id;
        const type = entry.frontmatter.type;
        if (!id || !type) {
          console.log(warn(`Skipping node with missing id/type: ${JSON.stringify(entry.frontmatter)}`));
          skipped += 1;
          continue;
        }

        if (nodeExists(paths, id) && !options.overwrite) {
          skipped += 1;
          continue;
        }

        const filePath = nodeFilePath(paths, type, id);
        writeNode(paths, { frontmatter: entry.frontmatter, content: entry.content, filePath });
        appendChangelog(paths, { action: "import", id, details: { source } });
        imported += 1;
      }

      let dailyImported = 0;
      for (const note of bundle.daily ?? []) {
        const date = (note.frontmatter as { date?: string }).date;
        if (!date) continue;
        const filePath = dailyNotePath(paths, date);
        if (fs.existsSync(filePath) && !options.overwrite) continue;
        writeDailyNote(paths, { frontmatter: note.frontmatter as never, content: note.content, filePath });
        dailyImported += 1;
      }

      if (options.noIndex !== true) {
        reindexStore(paths);
      }

      console.log(success(`Imported from ${chalk.bold(source)}`));
      console.log(kv("nodes imported", String(imported)));
      console.log(kv("nodes skipped", String(skipped)));
      if (dailyImported) console.log(kv("daily notes imported", String(dailyImported)));
      if (skipped > 0) console.log(dim("Use --overwrite to replace existing nodes with the same id."));
    });
}
