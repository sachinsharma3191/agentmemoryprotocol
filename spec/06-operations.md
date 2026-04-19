# 06 — Operations

AMP defines a standard set of operations for interacting with a memory store.

## Core Operations

Every AMP-compatible tool MUST support these operations:

| Operation | Description |
|-----------|-------------|
| `amp init` | Create a new memory store (generates `amp.yaml` and directory structure) |
| `amp store <content>` | Create a new node (auto-classifies type if not specified) |
| `amp recall <context>` | Retrieve relevant nodes for a given context |
| `amp search <query>` | Search by keyword, tag, or semantic similarity |
| `amp list [--type] [--status] [--tag]` | List nodes with filters |
| `amp show <id>` | Display a node's content and metadata |

### `amp init`

Creates a new AMP store in the current directory:

```bash
amp init --name "My Agent Memory" --agent-id my-agent
```

Generates:
- `amp.yaml` with the store manifest
- `nodes/` directory with type subdirectories
- `daily/` directory
- `index/` directory

### `amp store`

Creates a new memory node:

```bash
amp store "Python is preferred for backend work" --type preference --tags python,backend
amp store "Deployed v2.0 to production" --type episode
amp store "Always run tests before deploying" --type reflection
```

If `--type` is omitted, the implementation SHOULD auto-classify based on content.

### `amp recall`

Retrieves memories relevant to a context string:

```bash
amp recall "setting up a new Python API project"
# Returns: python-preferred, coding-style, deploy-to-production, ...
```

Implementations SHOULD use a combination of keyword matching, semantic similarity, and graph proximity to rank results.

### `amp search`

Search with explicit queries and filters:

```bash
amp search "python"
amp search --type preference --status active
amp search --tag backend --since 2026-01-01
```

## Management Operations

Implementations SHOULD support these operations:

| Operation | Description |
|-----------|-------------|
| `amp update <id>` | Modify a node's content or metadata |
| `amp archive <id>` | Set status to `archived` (soft delete) |
| `amp merge <id1> <id2>` | Combine two nodes into one, updating links |
| `amp supersede <old> <new>` | Mark old node as replaced by new node |
| `amp prune [--stale-days N] [--low-confidence F]` | Remove stale or low-confidence nodes |
| `amp distill [--date DATE]` | Process daily notes into permanent nodes |
| `amp reindex` | Rebuild all computed indices |

### `amp merge`

Merging two nodes:
1. Creates a new node combining content from both
2. Updates all links pointing to either source to point to the merged node
3. Archives the original nodes with `superseded_by` pointing to the merge result

### `amp prune`

Pruning removes stale or low-value memories:

```bash
amp prune --stale-days 90          # archive nodes not modified in 90 days
amp prune --low-confidence 0.3     # archive nodes with confidence < 0.3
amp prune --dry-run                # show what would be pruned without acting
```

## Portability Operations

Every AMP-compatible tool MUST support these operations:

| Operation | Description |
|-----------|-------------|
| `amp export [--format amp\|json\|markdown]` | Export the full store |
| `amp import <source>` | Import from an AMP bundle or supported format |
| `amp validate` | Check store integrity (broken links, missing fields, schema violations) |
| `amp stats` | Summary: node count by type, link density, staleness, orphan nodes |

### `amp validate`

Checks for:
- Missing required frontmatter fields
- Broken `[[links]]` (referencing non-existent nodes)
- ID/filename mismatches
- Orphan nodes (no links in or out)
- Duplicate IDs

### `amp stats`

Example output:

```
Store: Zenon's Memory (store_zenon_main)
Nodes: 47 (18 facts, 12 episodes, 8 preferences, 5 procedures, 4 reflections)
Links: 83 (avg 1.8 per node)
Orphans: 3
Active: 42 | Archived: 5
Oldest: 2026-03-23 | Newest: 2026-04-18
Daily notes: 4 pending, 12 distilled
```

## History Operations

Implementations SHOULD support (leverages git if available):

| Operation | Description |
|-----------|-------------|
| `amp diff [--since DATE]` | Show what changed since a date |
| `amp history <id>` | Version history of a specific node |
| `amp snapshot` | Tag the current state for future comparison |
