# 04 — Daily Notes

Daily notes are the **inbox** — raw observations that haven't been processed into permanent nodes yet.

## Format

```markdown
---
date: 2026-04-18
agent: zenon
status: pending          # pending | distilled | archived
---

# 2026-04-18

## Conversations

### 14:30 — Project planning with Tomek
- Discussed new memory management product
- Key insight: market is full of backends, nobody built the management layer
- Decision: open-source the protocol, commercial product on top

### 16:00 — Competitive research
- MemPalace went viral (22K stars)
- Mem0 is the current leader but SaaS-locked

## Observations
- The agent memory space is exploding but fragmented
- Portability is the underserved angle
```

## Frontmatter

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | date | ✅ | ISO 8601 date (`YYYY-MM-DD`) |
| `agent` | string | ❌ | Agent ID that created the note |
| `status` | enum | ✅ | `pending`, `distilled`, `archived` |

## File Naming

Daily notes MUST be named by date: `YYYY-MM-DD.md`

```
daily/
├── 2026-04-18.md
├── 2026-04-17.md
└── 2026-04-16.md
```

## Distillation

Distillation is the process of extracting permanent knowledge from daily notes into nodes:

```
daily/2026-04-18.md  →  distill  →  nodes/episodes/2026-04-18-project-planning.md
                                  →  nodes/facts/agent-memory-landscape.md
                                  →  nodes/reflections/portability-underserved.md
```

After distillation:
1. The daily note's status is set to `distilled`
2. New nodes are created in `nodes/` with `source: distillation`
3. The daily note is kept as a raw log (or archived per retention settings)

## Retention

The `settings.daily_retention` field in `amp.yaml` controls how long daily notes are kept before archival. A value of `30` means daily notes older than 30 days with `status: distilled` MAY be automatically archived.

Daily notes with `status: pending` SHOULD NOT be archived regardless of age.
