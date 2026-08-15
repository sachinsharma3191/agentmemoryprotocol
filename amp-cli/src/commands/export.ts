import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { listAllNodes } from "../core/node.js";
import { listDailyNotes } from "../core/daily.js";
import { readManifest, requireStore } from "../core/store.js";
import type { MemoryNode, StoreManifest } from "../core/types.js";
import { nowIso } from "../utils/helpers.js";
import { chalk, kv, success } from "../utils/ui.js";

interface ExportOptions {
  format?: string;
  output?: string;
}

export interface ExportBundle {
  amp: string;
  exported: string;
  manifest: StoreManifest;
  nodes: Array<{ frontmatter: MemoryNode["frontmatter"]; content: string }>;
  daily: Array<{ frontmatter: Record<string, unknown>; content: string }>;
}

export function buildExportBundle(paths: ReturnType<typeof requireStore>): ExportBundle {
  const manifest = readManifest(paths);
  const nodes = listAllNodes(paths);
  const daily = listDailyNotes(paths);

  return {
    amp: manifest.amp,
    exported: nowIso(),
    manifest,
    nodes: nodes.map((n) => ({ frontmatter: n.frontmatter, content: n.content })),
    daily: daily.map((d) => ({ frontmatter: d.frontmatter, content: d.content })),
  };
}

function toMarkdown(bundle: ExportBundle): string {
  const lines: string[] = [];
  lines.push(`# ${bundle.manifest.store.name}`, "");
  lines.push(`Exported ${bundle.exported}`, "");
  lines.push(`Agent: ${bundle.manifest.agent.name} (${bundle.manifest.agent.id})`, "");
  lines.push("---", "");

  const byType = new Map<string, typeof bundle.nodes>();
  for (const node of bundle.nodes) {
    const list = byType.get(node.frontmatter.type) ?? [];
    list.push(node);
    byType.set(node.frontmatter.type, list);
  }

  for (const [type, nodes] of byType) {
    lines.push(`## ${type[0].toUpperCase()}${type.slice(1)}s`, "");
    for (const node of nodes) {
      lines.push(`### ${node.frontmatter.id}`, "");
      lines.push(`- **status**: ${node.frontmatter.status}`);
      lines.push(`- **created**: ${node.frontmatter.created}`);
      if (node.frontmatter.tags?.length) lines.push(`- **tags**: ${node.frontmatter.tags.join(", ")}`);
      lines.push("", node.content, "");
    }
  }

  return lines.join("\n");
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export the store as amp (raw store copy), json, or markdown")
    .option("--format <format>", "amp|json|markdown", "json")
    .option("--output <path>", "Output file or directory (defaults based on format)")
    .action((options: ExportOptions) => {
      const paths = requireStore(process.cwd());
      const format = (options.format ?? "json").toLowerCase();

      if (format === "amp") {
        const output = options.output ?? path.join(process.cwd(), "amp-export");
        copyDir(paths.ampDir, path.join(output, ".amp"));
        console.log(success(`Exported raw store to ${chalk.bold(output)}`));
        return;
      }

      const bundle = buildExportBundle(paths);

      if (format === "json") {
        const output = options.output ?? path.join(process.cwd(), "amp-export.json");
        fs.writeFileSync(output, JSON.stringify(bundle, null, 2), "utf-8");
        console.log(success(`Exported JSON bundle to ${chalk.bold(output)}`));
        console.log(kv("nodes", String(bundle.nodes.length)));
        console.log(kv("daily notes", String(bundle.daily.length)));
        return;
      }

      if (format === "markdown") {
        const output = options.output ?? path.join(process.cwd(), "amp-export.md");
        fs.writeFileSync(output, toMarkdown(bundle), "utf-8");
        console.log(success(`Exported markdown to ${chalk.bold(output)}`));
        return;
      }

      throw new Error(`Unknown export format "${format}". Use amp, json, or markdown.`);
    });
}
