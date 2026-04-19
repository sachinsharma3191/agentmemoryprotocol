# Appendix B — Migration Path from MEMORY.md

For users migrating from a single MEMORY.md file (common in OpenClaw, Claude Code, and similar tools).

## Before

```
MEMORY.md
├── ## 2026-04-18
│   ├── ### Topic A (→ becomes a node)
│   └── ### Topic B (→ becomes a node)
└── ## 2026-03-23
    └── ### Topic C (→ becomes a node)
```

## After

```
.amp/
├── amp.yaml
├── nodes/
│   ├── episodes/2026-04-18-topic-a.md
│   ├── facts/topic-b.md
│   └── episodes/2026-03-23-topic-c.md
├── daily/
└── index/
```

## Migration Command

```bash
amp import memory-md MEMORY.md
```

## What the Importer Does

1. Parses MEMORY.md by date headers (`## YYYY-MM-DD`)
2. Splits each subsection (`### Title`) into a separate node
3. Auto-classifies node type based on content
4. Generates IDs from titles (kebab-case)
5. Sets `created` from the date header
6. Detects `[[links]]` if present in the original
7. Sets `source: import:memory-md`
8. Runs `amp validate` to verify the result

## Coexistence

During migration, both MEMORY.md and the AMP store can coexist. The agent can:

1. Read from the AMP store for structured recall
2. Continue writing to MEMORY.md if the agent doesn't support AMP yet
3. Periodically run `amp import memory-md MEMORY.md --incremental` to sync new entries

This allows gradual migration without disrupting existing agent workflows.
