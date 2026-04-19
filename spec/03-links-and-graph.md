# 03 — Links & Graph

Links between nodes use **wiki-style double-bracket syntax**: `[[node-id]]`

Connections between memories are as important as the memories themselves.

## Inline Links

Reference other nodes anywhere in the markdown body:

```markdown
This procedure depends on [[api-endpoint-v2]] being available.
See also [[coding-style]] for formatting requirements.
```

Tools MUST parse `[[...]]` syntax to build the link graph.

## Typed Links

For richer semantics, links can be declared in the frontmatter:

```yaml
links:
  - target: api-endpoint-v2
    relation: depends_on
  - target: old-deploy-process
    relation: supersedes
  - target: tests-before-deploy
    relation: supported_by
```

Typed links in frontmatter are in addition to inline `[[links]]`. Both contribute to the graph.

## Link Relation Types

| Relation | Meaning |
|----------|---------|
| `relates_to` | General association (default) |
| `depends_on` | This node requires the target |
| `supports` | This node provides evidence for the target |
| `contradicts` | This node conflicts with the target |
| `supersedes` | This node replaces the target |
| `derived_from` | This node was created from the target |
| `part_of` | This node is a component of the target |
| `example_of` | This node illustrates the target |

Implementations MAY define additional relation types. Unknown relation types SHOULD be treated as `relates_to`.

## Backlinks

Backlinks are **computed, not stored**. The index generator scans all nodes for `[[links]]` and typed frontmatter links, then builds the reverse graph.

This keeps nodes clean and avoids synchronization issues. A node never needs to know who links to it — that's derived from the graph index.

```json
// index/graph.json (generated)
{
  "python-preferred": {
    "outgoing": ["deploy-pipeline", "api-endpoint-v2", "coding-style", "frontend-stack"],
    "incoming": ["coding-style", "tech-stack-decisions"],
    "typed": [
      {"target": "deploy-pipeline", "relation": "relates_to"},
      {"target": "old-python-version", "relation": "supersedes"}
    ]
  }
}
```

## Link Resolution

- Links MUST reference node IDs (the `id` field / filename stem), not file paths
- Links to non-existent nodes SHOULD be flagged by `amp validate` but MUST NOT cause errors
- Orphan nodes (no incoming or outgoing links) SHOULD be reported by `amp stats`

## Circular Links

Circular links are allowed. A node MAY link to itself or participate in a cycle. This is a natural property of knowledge graphs.
