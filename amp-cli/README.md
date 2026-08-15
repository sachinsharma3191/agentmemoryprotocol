# amp-cli

**A command-line client for the [Agent Memory Protocol (AMP)](../README.md).**

AMP stores agent memory as markdown files with YAML frontmatter, in a plain
directory tree. `amp-cli` reads and writes that directory — no database,
no server, just files you can `cat`, `grep`, and put in git.

## Install

```bash
npm install
npm run build
npm link   # optional: makes `amp` available globally
```

Or run without installing globally:

```bash
npx amp-cli <command>
```

## Quick start

```bash
# Create a store in the current directory (writes ./.amp)
amp init --name "My Assistant Memory" --agent-id zenon

# Store a memory (type is auto-classified if omitted)
amp store "User prefers Python for backend work" --tags python,backend

# Store with explicit type / confidence
amp store "Deployed v2.0 to production" --type episode --confidence 0.9

# Recall memories relevant to a context string
amp recall "what language does the user like"

# Search with filters
amp search "deploy" --type episode --since 2026-01-01

# List / inspect
amp list --type preference
amp show python-preferred

# Manage
amp update python-preferred --add-tag backend
amp archive some-old-node
amp merge node-a node-b
amp prune --stale-days 90 --dry-run

# Daily notes → nodes
amp distill --date 2026-04-18

# Index & integrity
amp reindex
amp validate
amp stats

# Portability
amp export --format json --output backup.json
amp import backup.json
amp export --format markdown
amp export --format amp --output ./copy
```

## Store layout

```
.amp/
├── amp.yaml                 # store manifest
├── nodes/
│   ├── facts/
│   ├── episodes/
│   ├── preferences/
│   ├── procedures/
│   ├── reflections/
│   └── relations/
├── daily/                   # ephemeral daily logs (YYYY-MM-DD.md)
├── index/                   # regenerable: keywords.json, graph.json
│   └── embeddings/
└── .history/
    └── changelog.jsonl
```

## Commands

### Core

| Command | Description |
|---|---|
| `amp init` | Create a store with `amp.yaml` and directory structure |
| `amp store <content>` | Create a new memory node |
| `amp recall <context>` | Keyword-match nodes relevant to a context string |
| `amp search <query>` | Search with `--type`, `--status`, `--tag`, `--since` filters |
| `amp list` | List nodes with filters |
| `amp show <id>` | Display a node's content, metadata, and backlinks |

### Management

| Command | Description |
|---|---|
| `amp update <id>` | Modify content, tags, confidence, or status |
| `amp archive <id>` | Set status to `archived` |
| `amp merge <id1> <id2>` | Combine two nodes; the absorbed node becomes `superseded` |
| `amp prune` | Remove stale/low-confidence nodes (`--stale-days`, `--low-confidence`, `--dry-run`) |
| `amp distill` | Turn a daily note's bullet points into nodes, mark it `distilled` |
| `amp reindex` | Rebuild `index/keywords.json` and `index/graph.json` |

### Portability

| Command | Description |
|---|---|
| `amp export` | Export as `amp` (raw store copy), `json`, or `markdown` |
| `amp import <source>` | Import nodes/daily notes from a JSON export |
| `amp validate` | Check schema, filename/id consistency, and link integrity |
| `amp stats` | Summary statistics: counts by type/status/scope, tags, links |

Run `amp <command> --help` for full flag documentation.

## How classification and ids work

When `--type` is omitted, `amp store` guesses a type from simple keyword
heuristics (see `classifyContent` in `src/commands/store.ts`):

- "prefer(s)", "likes", "favorite" → `preference`
- "always", "never", "rule", "lesson learned" → `reflection`
- "how to", "steps", "procedure" → `procedure`
- "deployed", "happened", "shipped", "incident" → `episode`
- otherwise → `fact`

Node ids are slugified from the first few meaningful words of the content
(stopwords removed). Episode ids are date-prefixed (`2026-04-18-deploy-v2`).
Colliding ids get a numeric suffix (`-2`, `-3`, ...).

## Development

```bash
npm run dev -- store "hello world"   # run via tsx without building
npm test                              # vitest
npm run typecheck
npm run build                         # emit to dist/
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
