"""Typed data structures used across the amp package."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

NODE_TYPES = ("fact", "preference", "episode", "procedure", "reflection", "relation")
STATUS_VALUES = ("active", "archived", "superseded", "disputed", "redacted")
SCOPE_VALUES = ("agent", "user", "team", "workspace", "public")
LINK_RELATIONS = (
    "relates_to",
    "depends_on",
    "supports",
    "contradicts",
    "supersedes",
    "derived_from",
    "part_of",
    "example_of",
)

# Directory a node type lives in under nodes/.
TYPE_DIRS = {
    "fact": "facts",
    "preference": "preferences",
    "episode": "episodes",
    "procedure": "procedures",
    "reflection": "reflections",
    "relation": "facts",  # relations are rare stand-alone nodes; default bucket
}


@dataclass
class Link:
    target: str
    relation: str = "relates_to"

    def to_dict(self) -> dict[str, Any]:
        return {"target": self.target, "relation": self.relation}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Link":
        return cls(target=data["target"], relation=data.get("relation", "relates_to"))


@dataclass
class Node:
    """A single AMP memory node: YAML frontmatter + markdown body."""

    id: str
    type: str
    created: str
    modified: str
    author: str
    status: str = "active"
    source: Optional[str] = None
    confidence: Optional[float] = None
    tags: list[str] = field(default_factory=list)
    scope: Optional[str] = None
    superseded_by: Optional[str] = None
    ttl: Optional[str] = None
    links: list[Link] = field(default_factory=list)
    content: str = ""
    path: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)

    def frontmatter(self) -> dict[str, Any]:
        fm: dict[str, Any] = {
            "id": self.id,
            "type": self.type,
            "created": self.created,
            "modified": self.modified,
            "author": self.author,
            "status": self.status,
        }
        if self.source is not None:
            fm["source"] = self.source
        if self.confidence is not None:
            fm["confidence"] = self.confidence
        if self.tags:
            fm["tags"] = self.tags
        if self.scope is not None:
            fm["scope"] = self.scope
        if self.superseded_by is not None:
            fm["superseded_by"] = self.superseded_by
        if self.ttl is not None:
            fm["ttl"] = self.ttl
        if self.links:
            fm["links"] = [link.to_dict() for link in self.links]
        fm.update(self.extra)
        return fm

    def to_summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "tags": self.tags,
            "confidence": self.confidence,
            "created": self.created,
            "modified": self.modified,
            "scope": self.scope,
        }
