#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerStoreCommand } from "./commands/store.js";
import { registerRecallCommand } from "./commands/recall.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerListCommand } from "./commands/list.js";
import { registerShowCommand } from "./commands/show.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerArchiveCommand } from "./commands/archive.js";
import { registerMergeCommand } from "./commands/merge.js";
import { registerPruneCommand } from "./commands/prune.js";
import { registerDistillCommand } from "./commands/distill.js";
import { registerReindexCommand } from "./commands/reindex.js";
import { registerExportCommand } from "./commands/export.js";
import { registerImportCommand } from "./commands/import.js";
import { registerValidateCommand } from "./commands/validate.js";
import { registerStatsCommand } from "./commands/stats.js";
import { printError } from "./utils/ui.js";

const program = new Command();

program
  .name("amp")
  .description("CLI for the Agent Memory Protocol (AMP) — file-based memory for AI agents")
  .version("0.1.0");

registerInitCommand(program);
registerStoreCommand(program);
registerRecallCommand(program);
registerSearchCommand(program);
registerListCommand(program);
registerShowCommand(program);
registerUpdateCommand(program);
registerArchiveCommand(program);
registerMergeCommand(program);
registerPruneCommand(program);
registerDistillCommand(program);
registerReindexCommand(program);
registerExportCommand(program);
registerImportCommand(program);
registerValidateCommand(program);
registerStatsCommand(program);

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (err) {
  const commanderErr = err as { code?: string; exitCode?: number };
  if (commanderErr && typeof commanderErr.code === "string" && commanderErr.code.startsWith("commander.")) {
    // commander already printed help/usage/error output; exit with its code.
    process.exit(commanderErr.exitCode ?? 0);
  }
  printError(err);
  process.exit(1);
}
