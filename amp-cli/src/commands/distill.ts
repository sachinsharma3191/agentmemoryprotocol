import { Command } from "commander";
import { extractBulletPoints, readDailyNote, writeDailyNote } from "../core/daily.js";
import { nodeFilePath, nodeExists, writeNode } from "../core/node.js";
import { appendChangelog, readManifest, requireStore } from "../core/store.js";
import { reindexStore } from "../core/index.js";
import type { MemoryNode, NodeFrontmatter } from "../core/types.js";
import { classifyContent } from "./store.js";
import { generateIdFromContent, nowIso, slugify, todayDate } from "../utils/helpers.js";
import { chalk, dim, heading as headingStyle, success, warn } from "../utils/ui.js";

interface DistillOptions {
  date?: string;
  noIndex?: boolean;
  dryRun?: boolean;
}

export function registerDistillCommand(program: Command): void {
  program
    .command("distill")
    .description("Process a daily note into memory nodes and mark it distilled")
    .option("--date <date>", "Daily note date (YYYY-MM-DD), default: today")
    .option("--dry-run", "Show what would be created without writing", false)
    .option("--no-index", "Skip automatic reindexing")
    .action((options: DistillOptions) => {
      const paths = requireStore(process.cwd());
      const manifest = readManifest(paths);
      const date = options.date ?? todayDate();

      const note = readDailyNote(paths, date);
      if (!note) {
        console.log(warn(`No daily note found for ${date} (looked for .amp/daily/${date}.md).`));
        return;
      }

      if (note.frontmatter.status === "distilled") {
        console.log(dim(`Daily note for ${date} is already distilled.`));
        return;
      }

      const bullets = extractBulletPoints(note.content);

      if (bullets.length === 0) {
        console.log(warn(`No bullet points found in ${date} daily note to distill.`));
      }

      const created: MemoryNode[] = [];
      for (const bullet of bullets) {
        const type = classifyContent(bullet.text);
        let id = generateIdFromContent(bullet.text);
        if (type === "episode" && !/^\d{4}-\d{2}-\d{2}-/.test(id)) {
          id = `${date}-${id}`;
        }
        let finalId = id;
        let suffix = 2;
        while (nodeExists(paths, finalId) || created.some((n) => n.frontmatter.id === finalId)) {
          finalId = `${id}-${suffix}`;
          suffix += 1;
        }

        const timestamp = nowIso();
        const frontmatter: NodeFrontmatter = {
          id: finalId,
          type,
          created: timestamp,
          modified: timestamp,
          author: `agent:${manifest.agent.id}`,
          status: "active",
          source: `daily:${date}`,
          scope: manifest.settings.default_scope,
        };
        if (bullet.section) {
          const sectionTag = slugify(bullet.section);
          if (sectionTag) frontmatter.tags = [sectionTag];
        }

        const content = `# ${bullet.text}\n\n${bullet.text}${bullet.section ? `\n\n_From daily note section: ${bullet.section}_` : ""}`;
        const filePath = nodeFilePath(paths, type, finalId);
        created.push({ frontmatter, content, filePath });
      }

      if (options.dryRun) {
        console.log(headingStyle(`Would distill ${created.length} node(s) from ${date}`));
        for (const n of created) {
          console.log(`  ${chalk.bold(n.frontmatter.id)}  ${n.frontmatter.type}`);
        }
        return;
      }

      for (const n of created) {
        writeNode(paths, n);
        appendChangelog(paths, { action: "distill", id: n.frontmatter.id, details: { source: `daily:${date}` } });
      }

      note.frontmatter.status = "distilled";
      writeDailyNote(paths, note);
      appendChangelog(paths, { action: "distill-note", id: date, details: { nodesCreated: created.length } });

      if (options.noIndex !== true && manifest.settings.auto_index && created.length > 0) {
        reindexStore(paths);
      }

      console.log(success(`Distilled ${created.length} node(s) from ${date} daily note`));
      for (const n of created) {
        console.log(`  ${chalk.bold(n.frontmatter.id)}  ${dim(n.frontmatter.type)}`);
      }
    });
}
