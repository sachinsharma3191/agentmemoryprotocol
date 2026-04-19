# Agent Memory Protocol — Specification

> **Version:** 0.1-draft
> **Date:** 2026-04-18
> **Status:** Draft — feedback welcome

## Design Principles

1. **Distributed over centralized** — Memory is a graph of files, not a database. No single point of failure, no server required.
2. **Markdown-first** — Every memory node is a human-readable markdown file with YAML frontmatter. You can read your agent's memory with `cat`.
3. **Links are first-class** — Connections between memories are as important as the memories themselves. Wiki-style `[[links]]` between nodes.
4. **Git-native** — The filesystem IS the database. Version control, branching, merging, and history come for free.
5. **Portable** — Copy the directory. That's a migration. No export/import tooling required for the basic case.
6. **Agent-agnostic** — Any agent, any framework, any LLM. The spec defines structure, not runtime.
7. **Human-inspectable** — A person should be able to browse an agent's memory and understand it without specialized tools.

## Specification Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [Memory Store](01-memory-store.md) | Directory structure, root marker, store manifest |
| 02 | [Memory Nodes](02-memory-nodes.md) | Node format, frontmatter schema, node types |
| 03 | [Links & Graph](03-links-and-graph.md) | Wiki-links, typed relations, backlinks |
| 04 | [Daily Notes](04-daily-notes.md) | Ephemeral daily logs and distillation process |
| 05 | [Index](05-index.md) | Computed artifacts: keywords, graph, embeddings |
| 06 | [Operations](06-operations.md) | CLI operations: core, management, portability, history |
| 07 | [Agent Integration](07-agent-integration.md) | MCP tools, resource protocol, filesystem convention |
| 08 | [Interoperability](08-interoperability.md) | Import adapters, export formats |
| 09 | [Versioning](09-versioning.md) | Git-native versioning, non-git stores, conflict resolution |
| 10 | [Extensions](10-extensions.md) | Cost estimation, encryption, redaction |

## Appendices

| Document | Description |
|----------|-------------|
| [Comparison](appendix-comparison.md) | AMP vs Mem0, MemPalace, LangChain, MEMORY.md |
| [Migration](appendix-migration.md) | Migration path from MEMORY.md |

## Conventions

- **MUST**, **SHOULD**, **MAY** follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) semantics
- All timestamps are ISO 8601 in UTC
- All file paths use forward slashes
- YAML frontmatter follows [gray-matter](https://github.com/jonschlinkert/gray-matter) conventions
