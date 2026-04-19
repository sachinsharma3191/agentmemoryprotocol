# 01 — Memory Store

A memory store is a directory. That's it.

## Structure

```
.amp/                              # root marker (like .git/)
├── amp.yaml                       # store manifest
├── nodes/                         # memory nodes (the graph)
│   ├── facts/
│   │   ├── python-preferred.md
│   │   ├── api-endpoint-v2.md
│   │   └── deploy-pipeline.md
│   ├── episodes/
│   │   ├── 2026-04-18-frontend-deploy.md
│   │   └── 2026-03-23-v070-release.md
│   ├── preferences/
│   │   ├── coding-style.md
│   │   └── communication-tone.md
│   ├── procedures/
│   │   ├── deploy-to-production.md
│   │   └── create-new-repo.md
│   └── reflections/
│       ├── tests-before-deploy.md
│       └── context-window-costs.md
├── daily/                         # ephemeral daily logs (distill → nodes)
│   ├── 2026-04-18.md
│   └── 2026-04-17.md
├── index/                         # computed artifacts (regenerable)
│   ├── keywords.json              # TF-IDF keyword map
│   ├── graph.json                 # adjacency list of all links
│   └── embeddings/                # optional vector index
│       └── manifest.json
└── .history/                      # optional version metadata
    └── changelog.jsonl
```

## Root Marker

The presence of an `amp.yaml` file in a directory marks it as an AMP memory store. Tools MUST look for this file to identify a store.

The `.amp/` directory name is a convention but not required — a store can live in any directory as long as `amp.yaml` exists at the root.

## Store Manifest (`amp.yaml`)

Every store MUST have an `amp.yaml` at its root.

```yaml
amp: "0.1"                         # protocol version (required)
store:
  id: "store_zenon_main"           # unique identifier (required)
  name: "Zenon's Memory"           # human-readable name (required)
  created: "2026-03-23T00:00:00Z"  # creation timestamp (required)

agent:                              # optional — the primary agent
  id: "zenon"
  name: "Zenon"
  description: "Coding assistant"

settings:
  default_scope: "agent"           # agent | user | team | workspace
  auto_index: true                 # rebuild index on changes
  daily_retention: 30              # days before daily logs are pruned
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amp` | string | Protocol version. Currently `"0.1"` |
| `store.id` | string | Unique store identifier |
| `store.name` | string | Human-readable store name |
| `store.created` | datetime | ISO 8601 creation timestamp |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `agent.id` | string | — | Primary agent identifier |
| `agent.name` | string | — | Agent display name |
| `agent.description` | string | — | Agent description |
| `settings.default_scope` | enum | `"agent"` | Default scope for new nodes |
| `settings.auto_index` | boolean | `true` | Auto-rebuild index on changes |
| `settings.daily_retention` | integer | `30` | Days before daily logs are pruned |

## Directories

### `nodes/`

Contains all permanent memory nodes, organized by type. See [02 — Memory Nodes](02-memory-nodes.md).

Subdirectories SHOULD match node types: `facts/`, `episodes/`, `preferences/`, `procedures/`, `reflections/`. Custom subdirectories are allowed.

### `daily/`

Contains ephemeral daily logs. See [04 — Daily Notes](04-daily-notes.md).

### `index/`

Contains computed artifacts that are regenerable from nodes. See [05 — Index](05-index.md).

Tools SHOULD NOT rely on the index being present — it can always be rebuilt.

### `.history/`

Optional. Contains a changelog for non-git stores. See [09 — Versioning](09-versioning.md).
