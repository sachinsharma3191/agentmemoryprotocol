# 08 — Interoperability

AMP is designed to import from and export to existing systems.

## Import Adapters

The spec defines standard import paths from existing systems:

| Source | Method | Notes |
|--------|--------|-------|
| **ChatGPT** | JSON data export (Settings → Export) | Parse conversations, extract memories, distill into typed nodes |
| **Claude** | Conversation/project export | Extract project instructions, conversation knowledge |
| **Gemini** | Google Takeout export | Parse Gemini conversation data |
| **Mem0** | JSON API export | Map Mem0 memory objects to AMP nodes |
| **MemPalace** | SQLite dump | Extract memories from SQLite database |
| **OpenClaw** | MEMORY.md file | Parse sections into individual nodes |
| **Claude Code** | CLAUDE.md + .claude/ directory | Extract project context and instructions |
| **Cursor** | .cursorrules + context files | Extract rules and project knowledge |
| **LangChain** | MemoryStore serialization | Deserialize and map to AMP nodes |
| **Plain markdown** | Any .md files | Add frontmatter, detect `[[links]]` |

### ChatGPT Import

ChatGPT's data export includes:

- `conversations.json` — all conversation history
- `user.json` — account info
- `message_feedback.json` — ratings
- `model_comparisons.json` — A/B test data
- `shared_conversations.json` — shared chats

The import process:

1. Parse `conversations.json`
2. Extract explicit memories (if ChatGPT memory was enabled)
3. Distill conversations into knowledge nodes:
   - Facts stated by the user
   - Preferences expressed
   - Decisions made
   - Procedures discussed
4. Deduplicate (the same fact may appear across many conversations)
5. Score confidence based on frequency and recency
6. Generate `[[links]]` between related nodes
7. Output as AMP nodes

### Import Command

```bash
amp import chatgpt ~/Downloads/chatgpt-export.zip
amp import claude ~/Downloads/claude-export.json
amp import gemini ~/Downloads/takeout.zip --service gemini
amp import memory-md ./MEMORY.md
amp import markdown ./docs/
```

## Export Formats

| Format | Command | Description |
|--------|---------|-------------|
| **AMP native** | `amp export` | Copy the store directory. Default format. |
| **JSON bundle** | `amp export --format json` | Single `.amp.json` file with all nodes serialized |
| **Markdown zip** | `amp export --format markdown` | Flat markdown files without frontmatter (for human sharing) |

### JSON Bundle Format

```json
{
  "amp": "0.1",
  "store": {
    "id": "store_zenon_main",
    "name": "Zenon's Memory",
    "created": "2026-03-23T00:00:00Z"
  },
  "nodes": [
    {
      "id": "python-preferred",
      "type": "preference",
      "created": "2026-04-18T18:40:00Z",
      "modified": "2026-04-18T19:00:00Z",
      "author": "agent:zenon",
      "status": "active",
      "tags": ["python", "backend"],
      "content": "# Python Preferred for Backend\n\nUser consistently prefers Python..."
    }
  ],
  "exported": "2026-04-19T21:00:00Z"
}
```

## Cross-Format Compatibility

When importing from non-AMP sources, implementations MUST:

1. Generate valid AMP frontmatter for all imported nodes
2. Auto-generate IDs from content if source doesn't have IDs
3. Set `source` field to indicate the import origin (e.g., `source: import:chatgpt`)
4. Set reasonable defaults for required fields
5. Run `amp validate` after import to catch any issues
