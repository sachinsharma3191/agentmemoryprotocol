# Appendix A — Comparison with Existing Approaches

| Feature | AMP | Mem0 | MemPalace | LangChain | MEMORY.md |
|---------|-----|------|-----------|-----------|-----------|
| Storage | Filesystem (markdown) | Vector DB + API | SQLite | In-memory / DB | Single file |
| Human-readable | ✅ | ❌ | ❌ | ❌ | ✅ |
| Versioning | Git-native | API versioning | None | None | Git (manual) |
| Links/Graph | ✅ Wiki-style | ❌ | ❌ | ❌ | ❌ |
| Portability | Copy directory | API export | SQLite dump | Serialize | Copy file |
| Distributed | ✅ | ❌ (centralized) | ❌ (local DB) | ❌ | ❌ (single file) |
| Agent-agnostic | ✅ | ❌ (Mem0 SDK) | ❌ (MCP only) | ❌ (LangChain) | ✅ |
| Typed memories | ✅ (6 types) | Partial | ❌ | Partial | ❌ |
| Encryption | ✅ (age/SOPS) | Cloud-managed | None | None | ❌ |
| Import from providers | ✅ (ChatGPT, Claude, etc.) | ❌ | ❌ | ❌ | ❌ |
| MCP integration | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cost estimation | ✅ (extension) | ❌ | ❌ | ❌ | ❌ |

## Key Differentiators

**vs Mem0:** AMP is file-based and self-hosted by default. No vendor lock-in. Mem0 requires their SDK and (for paid features) their cloud. AMP stores are portable — copy the directory.

**vs MemPalace:** AMP stores are portable across machines and git-hostable. MemPalace uses SQLite which is local-only. AMP has typed memories and a link graph; MemPalace is flat key-value.

**vs LangChain Memory:** AMP is framework-agnostic. LangChain memory only works within LangChain. AMP is persistent by default; LangChain memory is often ephemeral.

**vs MEMORY.md:** AMP adds structure (typed nodes, frontmatter, links), while MEMORY.md is a single unstructured file. AMP scales to hundreds of memories; MEMORY.md becomes unwieldy beyond ~50 entries.
