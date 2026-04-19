# 07 — Agent Integration

AMP is designed to work with any AI agent. This section defines standard integration patterns.

## MCP Tools

An AMP-compatible [MCP](https://modelcontextprotocol.io/) server exposes these tools:

```json
{
  "tools": [
    {
      "name": "amp_store",
      "description": "Store a new memory. Provide content, type is auto-classified.",
      "parameters": {
        "content": { "type": "string", "description": "Memory content", "required": true },
        "type": { "type": "string", "enum": ["fact", "preference", "episode", "procedure", "reflection"], "required": false },
        "tags": { "type": "array", "items": { "type": "string" }, "required": false },
        "links": { "type": "array", "items": { "type": "string" }, "description": "IDs of related nodes", "required": false }
      }
    },
    {
      "name": "amp_recall",
      "description": "Recall memories relevant to the current context.",
      "parameters": {
        "context": { "type": "string", "description": "What you need memories about", "required": true },
        "limit": { "type": "integer", "default": 10, "required": false },
        "types": { "type": "array", "items": { "type": "string" }, "required": false }
      }
    },
    {
      "name": "amp_search",
      "description": "Search memories by keyword or semantic query.",
      "parameters": {
        "query": { "type": "string", "required": true },
        "filters": { "type": "object", "description": "Optional filters: {type, status, tags, since, scope}", "required": false }
      }
    },
    {
      "name": "amp_forget",
      "description": "Archive or supersede a memory.",
      "parameters": {
        "id": { "type": "string", "required": true },
        "reason": { "type": "string", "required": false },
        "superseded_by": { "type": "string", "required": false }
      }
    },
    {
      "name": "amp_link",
      "description": "Create a typed link between two memory nodes.",
      "parameters": {
        "source": { "type": "string", "required": true },
        "target": { "type": "string", "required": true },
        "relation": { "type": "string", "default": "relates_to", "required": false }
      }
    }
  ]
}
```

## Resource Protocol

For agents that read memory as context (e.g., injected into system prompts):

```
amp://store_id/nodes/python-preferred     → single node content
amp://store_id/recall?context=...         → relevant nodes for context
amp://store_id/search?q=...              → search results
amp://store_id/graph?root=node-id&depth=2 → subgraph around a node
```

MCP resource URIs allow agents to request specific memory slices as context.

## Filesystem Convention

For agents that work with files directly (OpenClaw, Claude Code, Codex, Cursor):

```
# The agent's workspace contains an AMP store
# Agent reads/writes markdown files directly
# Indexing happens asynchronously (cron, hook, or on-demand)
```

This is the simplest integration — the agent just reads and writes markdown files. No server, no API, no dependencies.

### Recommended Filesystem Workflow

1. Agent reads `amp.yaml` to confirm it's in an AMP store
2. Agent reads nodes directly from `nodes/` directory
3. Agent creates new nodes by writing `.md` files with valid frontmatter
4. Agent links to existing nodes using `[[node-id]]` syntax
5. Indexing runs asynchronously (e.g., on a cron schedule or file-watch hook)

## Auto-Classification

When an agent stores a memory without specifying a type, the implementation SHOULD auto-classify:

- Contains temporal markers ("today", "yesterday", dates) → **episode**
- Contains instructions ("to do X, run Y") → **procedure**
- Contains preference language ("prefer", "always", "never") → **preference**
- Contains observational language ("I noticed", "lesson learned") → **reflection**
- Default → **fact**

Implementations MAY use an LLM for more accurate classification.
