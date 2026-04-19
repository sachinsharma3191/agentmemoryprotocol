# 09 — Versioning

AMP is designed to work with git but does not require it.

## Git-Native Versioning

The primary versioning mechanism is **git**. Every mutation is a commit.

```bash
amp store "Python is preferred for backend"
# → creates nodes/preferences/python-preferred.md
# → git add + git commit -m "amp: store preference python-preferred"
```

This gives you:
- Full history via `git log`
- Branching and merging via git
- Collaboration via git remotes
- Conflict resolution via git merge
- Free hosting on GitHub/GitLab

### Commit Message Convention

AMP operations SHOULD generate conventional commits:

```
amp: store <type> <id>
amp: update <id>
amp: archive <id>
amp: merge <id1> + <id2> → <new-id>
amp: supersede <old> → <new>
amp: distill <date>
amp: prune <count> nodes
amp: reindex
```

## Non-Git Stores

For stores not backed by git, the `.history/changelog.jsonl` provides a basic audit trail:

```jsonl
{"ts":"2026-04-18T18:40:00Z","op":"store","id":"python-preferred","author":"agent:zenon"}
{"ts":"2026-04-18T19:00:00Z","op":"update","id":"python-preferred","author":"agent:zenon","fields":["confidence"]}
{"ts":"2026-04-19T10:00:00Z","op":"archive","id":"old-api-endpoint","author":"user:tomek","reason":"deprecated"}
```

### Changelog Entry Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ts` | datetime | ✅ | ISO 8601 timestamp |
| `op` | string | ✅ | Operation: `store`, `update`, `archive`, `merge`, `supersede`, `prune`, `distill` |
| `id` | string | ✅ | Node ID affected |
| `author` | string | ✅ | Who performed the operation |
| `fields` | string[] | ❌ | Which fields were modified (for `update`) |
| `reason` | string | ❌ | Why the operation was performed |

## Conflict Resolution

When merging two branches of the same store:

1. **No conflict:** Different nodes modified → auto-merge
2. **Content conflict:** Same node modified differently → standard git merge conflict markers in the markdown file
3. **Semantic conflict:** Two nodes now contradict each other → both marked `status: disputed`, a reflection node is auto-created to flag the contradiction
4. **Link conflict:** Broken links after merge → `amp validate` detects and reports

### Detecting Semantic Conflicts

After a merge, implementations SHOULD scan for:
- Two `active` nodes with `contradicts` relation
- Two `active` nodes covering the same topic with conflicting content
- Nodes where `superseded_by` points to an archived node

These SHOULD be surfaced to the user for resolution.
