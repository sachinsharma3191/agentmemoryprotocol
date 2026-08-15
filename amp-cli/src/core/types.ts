/**
 * Core TypeScript types for the Agent Memory Protocol (AMP).
 */

export type NodeType =
  | "fact"
  | "preference"
  | "episode"
  | "procedure"
  | "reflection"
  | "relation";

export type NodeStatus =
  | "active"
  | "archived"
  | "superseded"
  | "disputed"
  | "redacted";

export type Scope = "agent" | "user" | "team" | "workspace" | "public";

export type LinkRelation =
  | "relates_to"
  | "depends_on"
  | "supports"
  | "contradicts"
  | "supersedes"
  | "derived_from"
  | "part_of"
  | "example_of";

export interface NodeLink {
  target: string;
  relation: LinkRelation;
}

export interface NodeFrontmatter {
  id: string;
  type: NodeType;
  created: string;
  modified: string;
  author: string;
  status: NodeStatus;
  source?: string;
  confidence?: number;
  tags?: string[];
  scope?: Scope;
  superseded_by?: string;
  ttl?: string;
  links?: NodeLink[];
  [key: string]: unknown;
}

export interface MemoryNode {
  frontmatter: NodeFrontmatter;
  content: string;
  filePath: string;
}

export interface StoreManifest {
  amp: string;
  store: {
    id: string;
    name: string;
    created: string;
  };
  agent: {
    id: string;
    name: string;
    description?: string;
  };
  settings: {
    default_scope: Scope;
    auto_index: boolean;
    daily_retention: number;
    [key: string]: unknown;
  };
}

export interface DailyNoteFrontmatter {
  date: string;
  agent: string;
  status: "pending" | "distilled" | "archived";
  [key: string]: unknown;
}

export interface DailyNote {
  frontmatter: DailyNoteFrontmatter;
  content: string;
  filePath: string;
}

export interface KeywordEntry {
  keyword: string;
  score: number;
}

export interface KeywordsIndex {
  generated: string;
  nodes: Record<string, KeywordEntry[]>;
}

export interface GraphNodeLinks {
  outgoing: NodeLink[];
  incoming: NodeLink[];
}

export interface GraphIndex {
  generated: string;
  nodes: Record<string, GraphNodeLinks>;
}

export interface ChangelogEntry {
  timestamp: string;
  action: string;
  id: string;
  details?: Record<string, unknown>;
}
