/**
 * Shared helpers for exercising commander-registered commands in tests.
 * Not a test file itself (no *.test.ts suffix), so vitest won't collect it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { runInit } from "../src/commands/init.js";

export function makeTmpStore(opts: { name?: string; agentId?: string } = {}): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "amp-cli-test-"));
  runInit(tmpDir, { name: opts.name ?? "Test Store", agentId: opts.agentId ?? "tester" });
  return tmpDir;
}

export function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "amp-cli-test-"));
}

export function cleanTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Register a command on a fresh commander Program, chdir into `cwd` for the
 * duration of the call (since command actions read process.cwd()
 * internally), and parse `argv`.
 *
 * `forceOptions` lets a test inject option values that commander's parser
 * can never actually produce (e.g. `--no-index` maps to the `index`
 * attribute, not `noIndex`, so the source's `options.noIndex` check can only
 * be exercised by directly poking the parsed Command's option-value bag).
 */
export async function runCommand(
  register: (program: Command) => void,
  commandName: string,
  argv: string[],
  cwd: string,
  forceOptions?: Record<string, unknown>
): Promise<void> {
  const originalCwd = process.cwd();
  process.chdir(cwd);
  try {
    const program = new Command();
    program.exitOverride();
    register(program);

    if (forceOptions) {
      const sub = program.commands.find((c) => c.name() === commandName);
      if (sub) {
        for (const [k, v] of Object.entries(forceOptions)) {
          sub.setOptionValue(k, v);
        }
      }
    }

    await program.parseAsync(["node", "amp", commandName, ...argv]);
  } finally {
    process.chdir(originalCwd);
  }
}
