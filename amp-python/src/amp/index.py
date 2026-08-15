"""Build regenerable index artifacts: keywords.json and graph.json."""

from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

from .node import extract_wikilinks
from .types import Node

_WORD_RE = re.compile(r"[a-z0-9][a-z0-9_+-]*")

_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "to", "of", "in", "on",
    "for", "and", "or", "that", "this", "it", "with", "as", "at", "by",
    "be", "has", "have", "had", "not", "but", "from", "will", "we", "i",
    "you", "they", "he", "she", "so", "if", "than", "then", "there",
}


def tokenize(text: str) -> list[str]:
    return [w for w in _WORD_RE.findall(text.lower()) if w not in _STOPWORDS and len(w) > 1]


def build_keywords(nodes: Iterable[Node], top_n: int = 10) -> dict:
    nodes = list(nodes)
    doc_tokens: dict[str, list[str]] = {}
    for node in nodes:
        text = node.content + " " + " ".join(node.tags)
        doc_tokens[node.id] = tokenize(text)

    n_docs = max(len(doc_tokens), 1)
    doc_freq: Counter = Counter()
    for tokens in doc_tokens.values():
        for term in set(tokens):
            doc_freq[term] += 1

    result: dict[str, list[dict]] = {}
    for node in nodes:
        tokens = doc_tokens[node.id]
        if not tokens:
            result[node.id] = []
            continue
        counts = Counter(tokens)
        total = len(tokens)
        scores = []
        for term, count in counts.items():
            tf = count / total
            idf = math.log((1 + n_docs) / (1 + doc_freq[term])) + 1
            scores.append((term, round(tf * idf, 6)))
        scores.sort(key=lambda kv: kv[1], reverse=True)
        result[node.id] = [{"term": t, "score": s} for t, s in scores[:top_n]]

    return result


def build_graph(nodes: Iterable[Node]) -> dict:
    nodes = list(nodes)
    ids = {node.id for node in nodes}
    outgoing: dict[str, list[dict]] = defaultdict(list)
    incoming: dict[str, list[dict]] = defaultdict(list)

    for node in nodes:
        outgoing.setdefault(node.id, [])
        incoming.setdefault(node.id, [])

        seen_targets = set()
        for link in node.links:
            outgoing[node.id].append({"target": link.target, "relation": link.relation})
            seen_targets.add(link.target)

        for target in extract_wikilinks(node.content):
            if target in seen_targets:
                continue
            outgoing[node.id].append({"target": target, "relation": "relates_to"})
            seen_targets.add(target)

    for node in nodes:
        for link in outgoing[node.id]:
            target = link["target"]
            if target in ids:
                incoming.setdefault(target, []).append(
                    {"source": node.id, "relation": link["relation"]}
                )
            else:
                incoming.setdefault(target, [])

    return {
        "outgoing": dict(outgoing),
        "incoming": dict(incoming),
    }


def write_index(index_dir: Path, nodes: Iterable[Node]) -> tuple[dict, dict]:
    index_dir.mkdir(parents=True, exist_ok=True)
    nodes = list(nodes)
    keywords = build_keywords(nodes)
    graph = build_graph(nodes)

    (index_dir / "keywords.json").write_text(
        json.dumps(keywords, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (index_dir / "graph.json").write_text(
        json.dumps(graph, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (index_dir / "embeddings").mkdir(parents=True, exist_ok=True)
    return keywords, graph
