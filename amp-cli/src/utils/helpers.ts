/**
 * General-purpose helper utilities shared across commands.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "of", "to",
  "in", "on", "at", "by", "for", "with", "about", "against", "between",
  "into", "through", "during", "before", "after", "above", "below", "from",
  "up", "down", "is", "are", "was", "were", "be", "been", "being", "have",
  "has", "had", "having", "do", "does", "did", "doing", "will", "would",
  "should", "could", "can", "this", "that", "these", "those", "i", "you",
  "he", "she", "it", "we", "they", "them", "his", "her", "its", "our",
  "their", "as", "so", "not", "no", "just", "than", "too", "very", "also",
  "s", "t", "my", "me",
]);

/**
 * Slugify a string into kebab-case, suitable for use as a node id / filename.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Generate a slug id from free-text content by taking the first few
 * meaningful words.
 */
export function generateIdFromContent(content: string, wordCount = 5): string {
  const words = content
    .replace(/[#*_`>\[\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w.toLowerCase().replace(/[^a-z0-9]/gi, "")))
    .slice(0, wordCount);

  const base = slugify(words.join(" "));
  return base || `node-${Date.now()}`;
}

/**
 * Tokenize text into lowercase words, stripping punctuation and stopwords.
 */
export function tokenize(text: string, removeStopwords = true): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (!removeStopwords) return words;
  return words.filter((w) => !STOPWORDS.has(w) && w.length > 1);
}

/**
 * Current UTC timestamp in ISO 8601 format.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Today's date in YYYY-MM-DD.
 */
export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Format an ISO date string as YYYY-MM-DD.
 */
export function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Simple Jaccard-ish keyword overlap score between a set of query terms
 * and a document's terms.
 */
export function overlapScore(queryTerms: string[], docTerms: string[]): number {
  if (queryTerms.length === 0 || docTerms.length === 0) return 0;
  const docSet = new Set(docTerms);
  let hits = 0;
  for (const term of queryTerms) {
    if (docSet.has(term)) hits += 1;
  }
  return hits / queryTerms.length;
}

/**
 * Truncate a string to a max length, adding an ellipsis if truncated.
 */
export function truncate(text: string, maxLen = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1).trimEnd() + "…";
}

/**
 * Extract wiki-style [[node-id]] links from markdown content.
 */
export function extractWikiLinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([a-zA-Z0-9_-]+)\]\]/g);
  const ids = new Set<string>();
  for (const m of matches) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

/**
 * Derive a human-readable title from markdown content (first heading or
 * first line).
 */
export function deriveTitle(content: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  const firstLine = content.split("\n").find((l) => l.trim().length > 0);
  return firstLine ? truncate(firstLine, 60) : "Untitled";
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function isValidId(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}
