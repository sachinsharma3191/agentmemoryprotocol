# 10 — Extensions

Optional extensions that build on the core AMP specification.

## Cost Estimation

Memory-aware cost optimization. Helps users understand and reduce inference costs.

### Cost Metadata

Added to node frontmatter by tooling:

```yaml
cost:
  tokens: 847                    # estimated token count of this node
  last_accessed: 2026-04-18      # when this memory was last included in context
  access_count: 12               # how many times this memory was recalled
  estimated_monthly_cost: 0.003  # estimated $ if included in every context window
```

### Use Cases

- Identify expensive, rarely-used memories → suggest archival
- Estimate total memory cost per month
- Optimize which memories to include in context windows
- Report: "your agent's memory costs ~$X/month in tokens"

## Encryption at Rest

Nodes can be encrypted individually using [age](https://age-encryption.org/) or [SOPS](https://github.com/getsops/sops):

```
nodes/
├── facts/
│   ├── public-api-docs.md          # plaintext
│   └── credentials-vault.md.age    # encrypted with age
├── preferences/
│   └── personal-prefs.md.enc.yaml  # encrypted with SOPS
```

### Guidelines

- Encrypted files SHOULD use `.age` or `.enc.yaml` extensions
- Tools MUST gracefully handle encrypted nodes (skip or prompt for decryption)
- The `amp.yaml` manifest SHOULD NOT be encrypted (it's needed for store discovery)
- Index files (`index/`) SHOULD NOT contain content from encrypted nodes

## Redaction

For removing sensitive content while preserving the node's existence in the graph:

```yaml
---
id: sensitive-memory
type: fact
created: 2026-04-18T18:40:00Z
modified: 2026-04-19T10:00:00Z
status: redacted
redacted_at: 2026-04-19T10:00:00Z
redacted_by: user:tomek
redaction_reason: "Contains PII"
tags: [redacted]
---

# [REDACTED]

This memory has been redacted. Original content has been permanently removed.
```

### Redaction Rules

- Redacted nodes MUST have `status: redacted`
- Original content MUST be replaced, not just hidden
- Links to/from redacted nodes are preserved (the graph structure remains)
- Git history MAY still contain the original content — use `git filter-branch` or BFG for full purge

## Scoped Access

The `scope` field in frontmatter controls intended visibility:

| Scope | Visible To |
|-------|-----------|
| `agent` | Only the owning agent |
| `user` | The user and their agents |
| `team` | All members of a team |
| `workspace` | All agents in a workspace |
| `public` | Anyone |

Scope enforcement is **advisory** at the filesystem level. Implementations that serve memory over an API (MCP, HTTP) SHOULD enforce scope restrictions. A self-hosted, single-user store MAY choose not to enforce scopes.
