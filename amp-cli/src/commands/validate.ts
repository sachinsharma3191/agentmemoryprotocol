import path from "node:path";
import { Command } from "commander";
import { listAllNodes, listNodeFiles, parseNodeFile } from "../core/node.js";
import { readManifest, requireStore } from "../core/store.js";
import type { LinkRelation, NodeStatus, NodeType, Scope } from "../core/types.js";
import { chalk, dim, error as errorLine, heading, success, warn } from "../utils/ui.js";

const VALID_TYPES: NodeType[] = ["fact", "preference", "episode", "procedure", "reflection", "relation"];
const VALID_STATUSES: NodeStatus[] = ["active", "archived", "superseded", "disputed", "redacted"];
const VALID_SCOPES: Scope[] = ["agent", "user", "team", "workspace", "public"];
const VALID_RELATIONS: LinkRelation[] = [
  "relates_to",
  "depends_on",
  "supports",
  "contradicts",
  "supersedes",
  "derived_from",
  "part_of",
  "example_of",
];
const REQUIRED_FIELDS = ["id", "type", "created", "modified", "author", "status"];

export interface ValidationIssue {
  level: "error" | "warning";
  file: string;
  message: string;
}

export function validateStore(paths: ReturnType<typeof requireStore>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  try {
    readManifest(paths);
  } catch (err) {
    issues.push({ level: "error", file: paths.manifestFile, message: `Failed to parse manifest: ${(err as Error).message}` });
  }

  const files = listNodeFiles(paths);
  const seenIds = new Map<string, string>();
  const nodes = listAllNodes(paths);
  const idSet = new Set(nodes.map((n) => n.frontmatter.id));

  for (const file of files) {
    const relFile = path.relative(paths.root, file);
    let node;
    try {
      node = parseNodeFile(file);
    } catch /* v8 ignore start */ (err) {
      issues.push({ level: "error", file: relFile, message: `Failed to parse: ${(err as Error).message}` });
      continue;
    } /* v8 ignore stop */

    const fm = node.frontmatter as Record<string, unknown>;

    for (const field of REQUIRED_FIELDS) {
      if (fm[field] === undefined || fm[field] === null || fm[field] === "") {
        issues.push({ level: "error", file: relFile, message: `Missing required field "${field}"` });
      }
    }

    const baseName = path.basename(file, ".md");
    if (fm.id && fm.id !== baseName) {
      issues.push({
        level: "error",
        file: relFile,
        message: `Frontmatter id "${fm.id}" does not match filename "${baseName}"`,
      });
    }

    if (typeof fm.id === "string") {
      if (seenIds.has(fm.id)) {
        issues.push({ level: "error", file: relFile, message: `Duplicate id "${fm.id}" (also in ${seenIds.get(fm.id)})` });
      } else {
        seenIds.set(fm.id, relFile);
      }
    }

    if (fm.type && !VALID_TYPES.includes(fm.type as NodeType)) {
      issues.push({ level: "error", file: relFile, message: `Invalid type "${fm.type}"` });
    }
    if (fm.status && !VALID_STATUSES.includes(fm.status as NodeStatus)) {
      issues.push({ level: "error", file: relFile, message: `Invalid status "${fm.status}"` });
    }
    if (fm.scope && !VALID_SCOPES.includes(fm.scope as Scope)) {
      issues.push({ level: "warning", file: relFile, message: `Unknown scope "${fm.scope}"` });
    }
    if (fm.confidence !== undefined) {
      const c = Number(fm.confidence);
      if (Number.isNaN(c) || c < 0 || c > 1) {
        issues.push({ level: "error", file: relFile, message: `confidence must be between 0 and 1, got "${fm.confidence}"` });
      }
    }
    if (fm.created && Number.isNaN(new Date(fm.created as string).getTime())) {
      issues.push({ level: "error", file: relFile, message: `Invalid created timestamp "${fm.created}"` });
    }
    if (fm.modified && Number.isNaN(new Date(fm.modified as string).getTime())) {
      issues.push({ level: "error", file: relFile, message: `Invalid modified timestamp "${fm.modified}"` });
    }

    const links = (fm.links as Array<{ target: string; relation: string }> | undefined) ?? [];
    for (const link of links) {
      if (!link.target) {
        issues.push({ level: "error", file: relFile, message: "Link missing target" });
        continue;
      }
      if (!idSet.has(link.target)) {
        issues.push({ level: "warning", file: relFile, message: `Link target "${link.target}" does not exist` });
      }
      if (link.relation && !VALID_RELATIONS.includes(link.relation as LinkRelation)) {
        issues.push({ level: "warning", file: relFile, message: `Unknown link relation "${link.relation}"` });
      }
    }

    if (fm.status === "superseded" && !fm.superseded_by) {
      issues.push({ level: "warning", file: relFile, message: 'Status is "superseded" but superseded_by is not set' });
    }
    if (fm.superseded_by && !idSet.has(fm.superseded_by as string)) {
      issues.push({ level: "warning", file: relFile, message: `superseded_by "${fm.superseded_by}" does not exist` });
    }
  }

  return issues;
}

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Check store integrity: schema, ids, filenames, and link targets")
    .option("--json", "Output raw JSON", false)
    .action((options: { json?: boolean }) => {
      const paths = requireStore(process.cwd());
      const issues = validateStore(paths);

      if (options.json) {
        console.log(JSON.stringify(issues, null, 2));
        if (issues.some((i) => i.level === "error")) process.exitCode = 1;
        return;
      }

      const errors = issues.filter((i) => i.level === "error");
      const warnings = issues.filter((i) => i.level === "warning");

      if (issues.length === 0) {
        console.log(success("Store is valid. No issues found."));
        return;
      }

      console.log(heading(`Validation found ${errors.length} error(s), ${warnings.length} warning(s)`));
      console.log();
      for (const issue of issues) {
        const line = `${dim(issue.file)}  ${issue.message}`;
        console.log(issue.level === "error" ? errorLine(chalk.red(line)) : warn(line));
      }

      if (errors.length > 0) process.exitCode = 1;
    });
}
