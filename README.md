# Agent Memory Protocol (AMP)

**An open standard for portable, structured AI agent memory.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Spec Version](https://img.shields.io/badge/spec-v0.1--draft-orange.svg)](spec/README.md)

---

## The Problem

AI agents accumulate knowledge — facts, preferences, decisions, procedures — but that knowledge is:

- **Invisible** — users can't see what their agent knows
- **Locked in** — switch providers and you start from zero
- **Unmanageable** — no way to prune, merge, version, or audit
- **Incompatible** — every framework stores memory differently

## The Solution

AMP defines a **common format** for agent memory that is:

- 📄 **Markdown-first** — human-readable with `cat`, no special tools required
- 🔗 **Graph-native** — `[[wiki-links]]` between memory nodes
- 📦 **Portable** — copy the directory, that's a migration
- 🔀 **Git-friendly** — version control, branching, merging, and history for free
- 🤖 **Agent-agnostic** — works with any framework, any LLM, any runtime

## Quick Example

An AMP memory store is just a directory:

```
.amp/
├── amp.yaml                          # store manifest
├── nodes/                            # memory nodes
│   ├── facts/
│   │   └── python-preferred.md
│   ├── preferences/
│   │   └── coding-style.md
│   ├── episodes/
│   │   └── 2026-04-18-project-kickoff.md
│   └── procedures/
│       └── deploy-to-production.md
├── daily/                            # ephemeral daily logs
│   └── 2026-04-18.md
└── index/                            # computed (regenerable)
    ├── keywords.json
    └── graph.json
```

Each memory node is a markdown file with structured frontmatter:

```markdown
---
id: python-preferred
type: preference
created: 2026-04-18T18:40:00Z
modified: 2026-04-18T19:00:00Z
author: agent:zenon
confidence: 0.92
status: active
tags: [python, backend, preference]
---

# Python Preferred for Backend

User consistently prefers Python over JavaScript for backend work.
See also [[coding-style]] and [[deploy-to-production]].
```

## Specification

📖 **[Read the full spec →](spec/README.md)**

| Document | Description |
|----------|-------------|
| [Spec Overview](spec/README.md) | Design principles and spec structure |
| [Memory Store](spec/01-memory-store.md) | Directory structure and manifest |
| [Memory Nodes](spec/02-memory-nodes.md) | Node format, types, and frontmatter schema |
| [Links & Graph](spec/03-links-and-graph.md) | Wiki-links, typed relations, backlinks |
| [Daily Notes](spec/04-daily-notes.md) | Ephemeral logs and distillation |
| [Index](spec/05-index.md) | Computed artifacts (keywords, graph, embeddings) |
| [Operations](spec/06-operations.md) | CLI operations (core, management, portability) |
| [Agent Integration](spec/07-agent-integration.md) | MCP tools, resource protocol, filesystem convention |
| [Interoperability](spec/08-interoperability.md) | Import/export adapters |
| [Versioning](spec/09-versioning.md) | Git-native versioning and conflict resolution |
| [Extensions](spec/10-extensions.md) | Cost estimation, encryption, redaction |

## Implementations

> AMP is a new specification. Reference implementations are under development.

| Implementation | Language | Status |
|---------------|----------|--------|
| `amp-cli` | TypeScript | 🚧 Planned |
| `amp-mcp` | TypeScript | 🚧 Planned |
| `amp-python` | Python | 🚧 Planned |

Want to build an implementation? See the [spec](spec/README.md) and open an issue.

## Import From Existing Systems

AMP defines standard import paths from:

- **ChatGPT** — JSON data export → AMP nodes
- **Claude** — conversation export → AMP nodes
- **Gemini** — Google Takeout → AMP nodes
- **Mem0** — JSON API export → AMP nodes
- **MemPalace** — SQLite dump → AMP nodes
- **OpenClaw** — MEMORY.md → AMP nodes
- **Plain markdown** — add frontmatter, detect links

See [Interoperability](spec/08-interoperability.md) for details.

## Design Principles

1. **Distributed over centralized** — files, not databases
2. **Markdown-first** — human-readable always
3. **Links are first-class** — the graph matters
4. **Git-native** — version control for free
5. **Portable** — copy the directory = migration
6. **Agent-agnostic** — any agent, any framework, any LLM
7. **Human-inspectable** — no special tools to understand

## Contributing

AMP is an open specification and contributions are welcome.

- 💬 **Discuss** — [open an issue](https://github.com/agentmemoryprotocol/agentmemoryprotocol/issues) for questions, proposals, or feedback
- 📝 **Propose changes** — submit a PR against the spec
- 🔧 **Build** — create an implementation in your language of choice
- 📣 **Spread the word** — tell your AI agent framework about AMP

## License

This specification is licensed under [Apache 2.0](LICENSE).

---

**AMP is a project by [YouTale.AI](https://youtale.ai)**

*Your memories are gold. Own them.*
