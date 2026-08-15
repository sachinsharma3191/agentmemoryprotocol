/**
 * Small chalk-based console UI helpers shared across commands.
 */

import chalk from "chalk";
import type { NodeStatus, NodeType } from "../core/types.js";

export const typeColor: Record<NodeType, (s: string) => string> = {
  fact: chalk.blue,
  episode: chalk.magenta,
  preference: chalk.green,
  procedure: chalk.yellow,
  reflection: chalk.cyan,
  relation: chalk.gray,
};

export const statusColor: Record<NodeStatus, (s: string) => string> = {
  active: chalk.green,
  archived: chalk.gray,
  superseded: chalk.yellow,
  disputed: chalk.red,
  redacted: chalk.dim,
};

export function colorType(type: string): string {
  const fn = typeColor[type as NodeType];
  return fn ? fn(type) : chalk.white(type);
}

export function colorStatus(status: string): string {
  const fn = statusColor[status as NodeStatus];
  return fn ? fn(status) : chalk.white(status);
}

export function heading(text: string): string {
  return chalk.bold.underline(text);
}

export function success(text: string): string {
  return `${chalk.green("✓")} ${text}`;
}

export function error(text: string): string {
  return `${chalk.red("✗")} ${text}`;
}

export function warn(text: string): string {
  return `${chalk.yellow("⚠")} ${text}`;
}

export function info(text: string): string {
  return `${chalk.cyan("ℹ")} ${text}`;
}

export function dim(text: string): string {
  return chalk.dim(text);
}

export function kv(key: string, value: string): string {
  return `${chalk.dim(key + ":")} ${value}`;
}

export function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(error(chalk.red(message)));
}

export { chalk };
