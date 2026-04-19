# 05 — Index

Everything in `index/` is **regenerable** from the nodes. If you delete the index, you can rebuild it with `amp reindex`. It's a cache, not a source of truth.

## Keyword Map (`index/keywords.json`)

TF-IDF weighted keywords per node:

```json
{
  "python-preferred": {
    "keywords": ["python", "backend", "preference", "javascript", "fastapi"],
    "tfidf": {"python": 0.42, "backend": 0.31, "preference": 0.28}
  }
}
```

Implementations SHOULD generate keyword maps to enable fast text search without full-text indexing.

## Graph Index (`index/graph.json`)

Adjacency list of all links between nodes:

```json
{
  "python-preferred": {
    "outgoing": ["deploy-pipeline", "api-endpoint-v2", "coding-style"],
    "incoming": ["coding-style", "tech-stack-decisions"],
    "typed": [
      {"target": "deploy-pipeline", "relation": "relates_to"},
      {"target": "old-python-version", "relation": "supersedes"}
    ]
  }
}
```

Implementations MUST be able to rebuild this from scanning all nodes for `[[links]]` and typed frontmatter links.

## Embeddings (`index/embeddings/`)

Optional. Vector embeddings for semantic search.

```json
// index/embeddings/manifest.json
{
  "model": "text-embedding-3-small",
  "dimensions": 1536,
  "generated": "2026-04-18T20:00:00Z",
  "nodes": {
    "python-preferred": {"offset": 0, "length": 1536},
    "api-endpoint-v2": {"offset": 1536, "length": 1536}
  }
}
```

Embeddings are stored in a binary file (`embeddings.bin`) alongside the manifest.

- Embeddings are optional — a store without embeddings still works (keyword search only)
- Different implementations MAY use different embedding models
- The manifest MUST record which model and dimensions were used
- Embeddings SHOULD be regenerated when nodes change

## `.gitignore` Considerations

Implementations SHOULD add `index/` to `.gitignore` since it's regenerable. However, teams MAY choose to commit the index for faster cold starts.

Embeddings (`index/embeddings/`) SHOULD NOT be committed to git due to binary file size.
