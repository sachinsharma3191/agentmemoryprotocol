# amp-python

A Python implementation of the [Agent Memory Protocol (AMP)](../spec) — a
file-based memory protocol for AI agents. Memory is stored as markdown files
with YAML frontmatter in a plain directory structure. No database needed —
the filesystem *is* the database.

## Install

```bash
pip install amp-python
```

For local development:

```bash
cd amp-python
pip install -e ".[test]"
```

## CLI Quickstart

```bash
# Create a new store in ./.amp
amp init --name "My Memory" --agent-id zenon

# Store a memory (type is auto-classified if omitted)
amp store "User prefers Python for backend work" --tags python,backend --confidence 0.9

# Retrieve relevant memories for some context
amp recall "what language does the user like for backend?"

# Search with filters
amp search python --type preference --tag backend

# List, inspect, and manage nodes
amp list --type preference
amp show python-preferred
amp update python-preferred --add-tags typing
amp archive python-preferred
amp merge python-preferred other-node-id

# Maintenance
amp prune --stale-days 90 --low-confidence 0.3 --dry-run
amp distill --date 2026-04-18
amp reindex

# Portability
amp export --format json -o backup.json
amp import backup.json
amp validate
amp stats
```

Run `amp --help` or `amp <command> --help` for full option listings.

## Library Quickstart

```python
from amp import AmpStore

store = AmpStore(".amp")
store.init(name="My Memory", agent_id="my-agent")

node = store.store("Python is preferred", type="preference", tags=["python"])
results = store.recall("python backend")
results = store.search("python", type="preference")
nodes = store.list(type="fact")
node = store.show("python-preferred")

issues = store.validate()
stats = store.stats()
```

## Store Layout

```
.amp/
├── amp.yaml                # store manifest
├── nodes/                  # memory nodes (facts, episodes, preferences, procedures, reflections)
├── daily/                  # ephemeral daily logs
├── index/                  # computed artifacts (keywords.json, graph.json, embeddings/)
└── .history/
    └── changelog.jsonl
```

Each node is a markdown file with YAML frontmatter (id, type, created,
modified, author, status, and optional source/confidence/tags/scope/links).
See the [AMP specification](../spec) for the full format.

## License

Apache 2.0
