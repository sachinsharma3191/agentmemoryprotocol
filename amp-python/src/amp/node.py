"""Reading, writing, and parsing of AMP memory nodes."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Optional

import frontmatter

from .types import TYPE_DIRS, Link, Node

_SLUG_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "to", "of", "in", "on",
    "for", "and", "or", "that", "this", "it", "with", "as", "at", "by",
}

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]")


def slugify(text: str, max_words: int = 5) -> str:
    """Turn free text into a kebab-case slug suitable for a node id."""
    text = text.strip().lower()
    # Drop markdown/code punctuation, keep alnum and spaces/hyphens.
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    words = re.split(r"[\s-]+", text)
    words = [w for w in words if w]
    significant = [w for w in words if w not in _SLUG_STOPWORDS] or words
    slug_words = significant[:max_words] if significant else words[:max_words]
    slug = "-".join(slug_words).strip("-")
    return slug or "note"


def node_filename(node_id: str, node_type: str, date: Optional[str] = None) -> str:
    """Compute the filename for a node, applying the episode date prefix rule."""
    if node_type == "episode" and date:
        day = date[:10]
        if not node_id.startswith(day):
            return f"{day}-{node_id}.md"
    return f"{node_id}.md"


def type_dir(nodes_root: Path, node_type: str) -> Path:
    sub = TYPE_DIRS.get(node_type, "facts")
    return nodes_root / sub


def extract_wikilinks(body: str) -> list[str]:
    return sorted(set(WIKILINK_RE.findall(body)))


def parse_links(raw_links: Any) -> list[Link]:
    links: list[Link] = []
    if not raw_links:
        return links
    for item in raw_links:
        if isinstance(item, dict) and "target" in item:
            links.append(Link.from_dict(item))
        elif isinstance(item, str):
            links.append(Link(target=item))
    return links


def node_from_post(post: "frontmatter.Post", path: Path) -> Node:
    meta = dict(post.metadata)
    known = {
        "id", "type", "created", "modified", "author", "status", "source",
        "confidence", "tags", "scope", "superseded_by", "ttl", "links",
    }
    extra = {k: v for k, v in meta.items() if k not in known}
    return Node(
        id=meta.get("id", path.stem),
        type=meta.get("type", "fact"),
        created=str(meta.get("created", "")),
        modified=str(meta.get("modified", "")),
        author=meta.get("author", "unknown"),
        status=meta.get("status", "active"),
        source=meta.get("source"),
        confidence=meta.get("confidence"),
        tags=list(meta.get("tags") or []),
        scope=meta.get("scope"),
        superseded_by=meta.get("superseded_by"),
        ttl=meta.get("ttl"),
        links=parse_links(meta.get("links")),
        content=post.content,
        path=str(path),
        extra=extra,
    )


def read_node(path: Path) -> Node:
    post = frontmatter.load(str(path))
    return node_from_post(post, path)


def write_node(nodes_root: Path, node: Node, date: Optional[str] = None) -> Path:
    """Serialize a Node to disk under nodes_root, returning the file path."""
    directory = type_dir(nodes_root, node.type)
    directory.mkdir(parents=True, exist_ok=True)
    filename = node_filename(node.id, node.type, date=date or node.created)
    path = directory / filename
    post = frontmatter.Post(node.content, **node.frontmatter())
    path.write_text(frontmatter.dumps(post) + "\n", encoding="utf-8")
    node.path = str(path)
    return path


def iter_node_files(nodes_root: Path):
    if not nodes_root.exists():
        return
    for path in sorted(nodes_root.rglob("*.md")):
        yield path


def title_from_content(content: str, node_id: str) -> str:
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("#"):
            return line.lstrip("#").strip()
    return node_id.replace("-", " ").title()
