import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import {
  buildStorePaths,
  ensureStoreLayout,
  findStoreRoot,
  writeManifest,
} from "../core/store.js";
import type { StoreManifest } from "../core/types.js";
import { nowIso, slugify } from "../utils/helpers.js";
import { chalk, heading, kv, success, warn } from "../utils/ui.js";

interface InitOptions {
  name?: string;
  agentId?: string;
  agentName?: string;
  description?: string;
  scope?: string;
  force?: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create a new AMP memory store in the current directory")
    .option("--name <name>", "Human-readable name for the store", "Memory Store")
    .option("--agent-id <id>", "Identifier for the owning agent", "assistant")
    .option("--agent-name <name>", "Human-readable agent name")
    .option("--description <text>", "Short description of the agent")
    .option("--scope <scope>", "Default scope for new nodes", "agent")
    .option("--force", "Reinitialize even if a store already exists here", false)
    .action((options: InitOptions) => {
      runInit(process.cwd(), options);
    });
}

export function runInit(cwd: string, options: InitOptions): void {
  const existingRoot = findStoreRoot(cwd);
  if (existingRoot && !options.force) {
    console.log(warn(`An AMP store already exists at ${chalk.bold(existingRoot)}.`));
    console.log(chalk.dim("Use --force to reinitialize, or cd elsewhere."));
    return;
  }

  const paths = buildStorePaths(cwd);
  ensureStoreLayout(paths);

  const storeId = `store_${slugify(options.name ?? "memory-store")}`;
  const manifest: StoreManifest = {
    amp: "0.1",
    store: {
      id: storeId,
      name: options.name ?? "Memory Store",
      created: nowIso(),
    },
    agent: {
      id: options.agentId ?? "assistant",
      name: options.agentName ?? options.agentId ?? "Assistant",
      description: options.description ?? "A helpful AI assistant",
    },
    settings: {
      default_scope: (options.scope as StoreManifest["settings"]["default_scope"]) ?? "agent",
      auto_index: true,
      daily_retention: 30,
    },
  };

  writeManifest(paths, manifest);

  console.log(success(`Initialized AMP store at ${chalk.bold(path.join(cwd, ".amp"))}`));
  console.log();
  console.log(heading("Store"));
  console.log(kv("id", manifest.store.id));
  console.log(kv("name", manifest.store.name));
  console.log(kv("agent", `${manifest.agent.name} (${manifest.agent.id})`));
  console.log();
  console.log(chalk.dim('Next: amp store "some memory content" --type fact'));
}
