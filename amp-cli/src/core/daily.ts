/**
 * Reading and writing of ephemeral daily notes under .amp/daily.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { DailyNote, DailyNoteFrontmatter } from "./types.js";
import type { StorePaths } from "./store.js";

export function dailyNotePath(paths: StorePaths, date: string): string {
  return path.join(paths.dailyDir, `${date}.md`);
}

export function readDailyNote(paths: StorePaths, date: string): DailyNote | null {
  const filePath = dailyNotePath(paths, date);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as DailyNoteFrontmatter,
    content: parsed.content.trim(),
    filePath,
  };
}

export function writeDailyNote(paths: StorePaths, note: DailyNote): void {
  fs.mkdirSync(path.dirname(note.filePath), { recursive: true });
  const raw = matter.stringify(note.content.trimEnd() + "\n", note.frontmatter as Record<string, unknown>);
  fs.writeFileSync(note.filePath, raw, "utf-8");
}

export function listDailyNotes(paths: StorePaths): DailyNote[] {
  if (!fs.existsSync(paths.dailyDir)) return [];
  return fs
    .readdirSync(paths.dailyDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const filePath = path.join(paths.dailyDir, f);
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      return {
        frontmatter: parsed.data as DailyNoteFrontmatter,
        content: parsed.content.trim(),
        filePath,
      };
    })
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

/**
 * Extract bullet-point lines (e.g. "- Key insight about X") from a daily
 * note body, along with the nearest preceding heading as light context.
 */
export function extractBulletPoints(content: string): Array<{ text: string; section: string }> {
  const lines = content.split("\n");
  let currentSection = "";
  const bullets: Array<{ text: string; section: string }> = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
      continue;
    }
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      const text = bulletMatch[1].trim();
      if (text) bullets.push({ text, section: currentSection });
    }
  }

  return bullets;
}
