import { Command } from "commander";
import { requireNodeById, writeNode } from "../core/node.js";
import { appendChangelog, readManifest, requireStore } from "../core/store.js";
import { reindexStore } from "../core/index.js";
import { nowIso } from "../utils/helpers.js";
import { chalk, kv, success } from "../utils/ui.js";

interface MergeOptions {
  keep?: string;
  noIndex?: boolean;
}

export function registerMergeCommand(program: Command): void {
  program
    .command("merge <id1> <id2>")
    .description("Combine two nodes into one, archiving the other as superseded")
    .option("--keep <id>", "Which id to keep as canonical (default: id1)")
    .option("--no-index", "Skip automatic reindexing")
    .action((id1: string, id2: string, options: MergeOptions) => {
      const paths = requireStore(process.cwd());
      const manifest = readManifest(paths);

      if (id1 === id2) throw new Error("Cannot merge a node with itself.");

      const nodeA = requireNodeById(paths, id1);
      const nodeB = requireNodeById(paths, id2);

      const keepId = options.keep ?? id1;
      const [survivor, absorbed] = keepId === id2 ? [nodeB, nodeA] : [nodeA, nodeB];

      const survivorHeading = survivor.content.match(/^#\s+.+$/m)?.[0];
      const survivorBody = survivorHeading ? survivor.content.replace(survivorHeading, "").trim() : survivor.content.trim();
      const absorbedBody = absorbed.content.replace(/^#\s+.+$/m, "").trim();

      const mergedContent = [survivorHeading, "", survivorBody, "", `## Merged from ${absorbed.frontmatter.id}`, "", absorbedBody]
        .filter((l) => l !== undefined)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const mergedTags = Array.from(new Set([...(survivor.frontmatter.tags ?? []), ...(absorbed.frontmatter.tags ?? [])]));

      survivor.content = mergedContent;
      if (mergedTags.length) survivor.frontmatter.tags = mergedTags;
      if (absorbed.frontmatter.confidence !== undefined) {
        survivor.frontmatter.confidence = Math.max(
          survivor.frontmatter.confidence ?? 0,
          absorbed.frontmatter.confidence
        );
      }
      const links = survivor.frontmatter.links ?? [];
      links.push({ target: absorbed.frontmatter.id, relation: "derived_from" });
      survivor.frontmatter.links = links;
      survivor.frontmatter.modified = nowIso();

      absorbed.frontmatter.status = "superseded";
      absorbed.frontmatter.superseded_by = survivor.frontmatter.id;
      absorbed.frontmatter.modified = nowIso();

      writeNode(paths, survivor);
      writeNode(paths, absorbed);

      appendChangelog(paths, {
        action: "merge",
        id: survivor.frontmatter.id,
        details: { absorbed: absorbed.frontmatter.id },
      });

      if (options.noIndex !== true && manifest.settings.auto_index) {
        reindexStore(paths);
      }

      console.log(success(`Merged ${chalk.bold(absorbed.frontmatter.id)} into ${chalk.bold(survivor.frontmatter.id)}`));
      console.log(kv("survivor status", survivor.frontmatter.status));
      console.log(kv("absorbed status", absorbed.frontmatter.status));
    });
}
