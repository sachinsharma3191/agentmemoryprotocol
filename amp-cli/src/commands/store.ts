import { Command } from "commander";
import { nodeFilePath, nodeExists, writeNode } from "../core/node.js";
import { appendChangelog, readManifest, requireStore } from "../core/store.js";
import type { MemoryNode, NodeFrontmatter, NodeType, Scope } from "../core/types.js";
import { generateIdFromContent, nowIso, todayDate } from "../utils/helpers.js";
import { chalk, colorType, kv, success } from "../utils/ui.js";
import { reindexStore } from "../core/index.js";

interface StoreOptions {
  type?: string;
  tags?: string;
  confidence?: string;
  source?: string;
  scope?: string;
  author?: string;
  id?: string;
  noIndex?: boolean;
}

const VALID_TYPES: NodeType[] = ["fact", "preference", "episode", "procedure", "reflection", "relation"];

/**
 * Very lightweight keyword-based heuristic for guessing a node's type when
 * the caller doesn't specify one explicitly.
 */
export function classifyContent(content: string): NodeType {
  const text = content.toLowerCase();

  if (/\b(prefer|prefers|preferred|likes|dislikes|favou?rite)\b/.test(text)) {
    return "preference";
  }
  if (/\b(always|never|rule|lesson learned|in general|going forward)\b/.test(text)) {
    return "reflection";
  }
  if (/\b(how to|steps?|step \d|first,|procedure|process:|instructions?)\b/.test(text)) {
    return "procedure";
  }
  if (/\b(deployed|happened|occurred|yesterday|today|met with|shipped|released|incident)\b/.test(text)) {
    return "episode";
  }
  return "fact";
}

export function registerStoreCommand(program: Command): void {
  program
    .command("store <content>")
    .description("Create a new memory node from content")
    .option("--type <type>", "Node type (fact|preference|episode|procedure|reflection|relation)")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--confidence <n>", "Confidence score between 0 and 1")
    .option("--source <source>", "Provenance, e.g. conversation:abc123")
    .option("--scope <scope>", "Scope: agent|user|team|workspace|public")
    .option("--author <author>", "Author identifier, e.g. agent:zenon")
    .option("--id <id>", "Explicit node id (overrides auto-generated id)")
    .option("--no-index", "Skip automatic reindexing after storing")
    .action((content: string, options: StoreOptions) => {
      const node = runStore(process.cwd(), content, options);
      console.log(success(`Stored ${colorType(node.frontmatter.type)} node ${chalk.bold(node.frontmatter.id)}`));
      console.log(kv("file", node.filePath));
      if (node.frontmatter.tags?.length) {
        console.log(kv("tags", node.frontmatter.tags.join(", ")));
      }
    });
}

export function runStore(cwd: string, content: string, options: StoreOptions): MemoryNode {
  const paths = requireStore(cwd);
  const manifest = readManifest(paths);

  const type = normalizeType(options.type) ?? classifyContent(content);

  let id = options.id ?? generateIdFromContent(content);
  if (type === "episode" && !/^\d{4}-\d{2}-\d{2}-/.test(id)) {
    id = `${todayDate()}-${id}`;
  }

  let finalId = id;
  let suffix = 2;
  while (nodeExists(paths, finalId)) {
    finalId = `${id}-${suffix}`;
    suffix += 1;
  }

  const tags = options.tags
    ? options.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const confidence = options.confidence !== undefined ? Number(options.confidence) : undefined;
  if (confidence !== undefined && (Number.isNaN(confidence) || confidence < 0 || confidence > 1)) {
    throw new Error(`--confidence must be a number between 0 and 1, got "${options.confidence}"`);
  }

  const timestamp = nowIso();
  const frontmatter: NodeFrontmatter = {
    id: finalId,
    type,
    created: timestamp,
    modified: timestamp,
    author: options.author ?? `agent:${manifest.agent.id}`,
    status: "active",
    scope: (options.scope as Scope | undefined) ?? manifest.settings.default_scope,
  };
  if (options.source) frontmatter.source = options.source;
  if (confidence !== undefined) frontmatter.confidence = confidence;
  if (tags.length) frontmatter.tags = tags;

  const filePath = nodeFilePath(paths, type, finalId);
  const title = deriveHeading(content);
  const body = content.trim().startsWith("#") ? content.trim() : `# ${title}\n\n${content.trim()}`;

  const node: MemoryNode = { frontmatter, content: body, filePath };
  writeNode(paths, node);

  appendChangelog(paths, { action: "store", id: finalId, details: { type } });

  if (options.noIndex !== true && manifest.settings.auto_index) {
    reindexStore(paths);
  }

  return node;
}

function normalizeType(type?: string): NodeType | undefined {
  if (!type) return undefined;
  const lower = type.toLowerCase() as NodeType;
  if (!VALID_TYPES.includes(lower)) {
    throw new Error(`Invalid --type "${type}". Must be one of: ${VALID_TYPES.join(", ")}`);
  }
  return lower;
}

function deriveHeading(content: string): string {
  const firstLine = content.trim().split("\n")[0] ?? content;
  const words = firstLine.split(/\s+/).slice(0, 8).join(" ");
  return words.length < firstLine.length ? `${words}…` : words;
}
