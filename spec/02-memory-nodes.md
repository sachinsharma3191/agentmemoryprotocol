# 02 — Memory Nodes

Every memory is a single markdown file with YAML frontmatter. This is the atom of AMP.

## Node Format

```markdown
---
id: python-preferred
type: preference
created: 2026-04-18T18:40:00Z
modified: 2026-04-18T19:00:00Z
author: agent:zenon
source: conversation:abc123
confidence: 0.92
status: active
tags: [python, backend, preference, tech-stack]
scope: user
---

# Python Preferred for Backend

User consistently prefers Python over JavaScript for backend work.
Mentioned in discussions about [[deploy-pipeline]] and [[api-endpoint-v2]].

## Evidence

- 2026-04-15: "Let's use Python for the API" during project planning
- 2026-03-20: Chose FastAPI over Express for the new service
- Aligns with [[coding-style]] preferences

## Exceptions

- Frontend tooling: user accepts JavaScript/TypeScript (see [[frontend-stack]])
```

## Frontmatter Schema

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier. MUST match the filename stem (e.g., `python-preferred` → `python-preferred.md`) |
| `type` | enum | One of: `fact`, `preference`, `episode`, `procedure`, `reflection`, `relation` |
| `created` | datetime | ISO 8601 timestamp of when the memory was first created |
| `modified` | datetime | ISO 8601 timestamp of last modification |
| `author` | string | Who created it. Format: `agent:<id>`, `user:<id>`, or `system` |
| `status` | enum | One of: `active`, `archived`, `superseded`, `disputed`, `redacted` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Origin of the memory: `conversation:<id>`, `document:<path>`, `observation`, `distillation` |
| `confidence` | float | 0.0–1.0, how certain the agent is about this memory |
| `tags` | string[] | Freeform tags for filtering and categorization |
| `scope` | enum | Visibility: `agent`, `user`, `team`, `workspace`, `public` |
| `superseded_by` | string | ID of the node that replaces this one (when `status: superseded`) |
| `ttl` | duration | Time-to-live before automatic archival (e.g., `30d`, `6h`) |
| `links` | array | Typed links to other nodes. See [03 — Links & Graph](03-links-and-graph.md) |

## Node Types

| Type | Purpose | Typical Lifecycle |
|------|---------|-------------------|
| **fact** | Declarative knowledge ("X is Y") | Long-lived, updated when facts change |
| **preference** | User or agent preference | Long-lived, may evolve |
| **episode** | Event with temporal context | Permanent record, never modified |
| **procedure** | How-to instructions | Updated as processes change |
| **reflection** | Meta-knowledge, lessons learned | Grows over time with new evidence |
| **relation** | Explicit typed connection between entities | Structural, maintained by the system |

### Type Guidelines

- **fact**: Use for objective, verifiable knowledge. "The API endpoint is `/v2/users`." "Python 3.12 is the current version."
- **preference**: Use for subjective choices. "User prefers dark mode." "Always use type hints in Python."
- **episode**: Use for events that happened at a specific time. "Deployed v0.7.0 on 2026-03-23." Never modify episodes — they're historical records.
- **procedure**: Use for instructions and processes. "To deploy: run `make deploy`." Update when the process changes.
- **reflection**: Use for insights and meta-observations. "Tests before deploy saves time in the long run." May accumulate evidence over time.
- **relation**: Use for explicit entity relationships. "Tomek is the admin of the kfc-labs org." Maintained by the system or user, not typically auto-generated.

## File Naming

- Filename MUST match the `id` field: `python-preferred.md` → `id: python-preferred`
- Use kebab-case for IDs: `my-memory-node`, not `myMemoryNode` or `my_memory_node`
- Episode IDs SHOULD be date-prefixed: `2026-04-18-frontend-deploy`
- Files MUST have the `.md` extension

## Content Guidelines

The markdown body after the frontmatter is freeform. However:

- The first `# heading` SHOULD be a human-readable title
- Use `[[wiki-links]]` to reference other nodes (see [03 — Links & Graph](03-links-and-graph.md))
- Include evidence, context, or reasoning where relevant
- Keep nodes focused — one concept per node
