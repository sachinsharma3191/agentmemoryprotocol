"""Store discovery, manifest handling, and the core AmpStore API."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import yaml

from . import index as index_mod
from .node import (
    extract_wikilinks,
    iter_node_files,
    node_filename,
    read_node,
    slugify,
    type_dir,
    write_node,
)
from .types import LINK_RELATIONS, NODE_TYPES, SCOPE_VALUES, STATUS_VALUES, Link, Node
from .util import now_iso, parse_date, today_str

AMP_VERSION = "0.1"


class AmpError(Exception):
    """Base class for amp library errors."""


class StoreNotFoundError(AmpError):
    pass


class StoreExistsError(AmpError):
    pass


class NodeNotFoundError(AmpError):
    pass


class NodeExistsError(AmpError):
    pass


class ValidationIssue:
    def __init__(self, level: str, message: str, node_id: Optional[str] = None):
        self.level = level  # "error" | "warning"
        self.message = message
        self.node_id = node_id

    def to_dict(self) -> dict[str, Any]:
        return {"level": self.level, "message": self.message, "node_id": self.node_id}

    def __repr__(self) -> str:
        prefix = f"[{self.node_id}] " if self.node_id else ""
        return f"{self.level.upper()}: {prefix}{self.message}"


@dataclass
class RecallResult:
    node: Node
    score: float


class AmpStore:
    """Programmatic interface to an AMP memory store rooted at a `.amp` directory."""

    def __init__(self, path: str | Path = ".amp"):
        self.root = Path(path)

    # ------------------------------------------------------------------
    # Discovery / paths
    # ------------------------------------------------------------------

    @classmethod
    def discover(cls, start: str | Path = ".") -> "AmpStore":
        """Search `start` and its parents for a `.amp` directory."""
        current = Path(start).resolve()
        for candidate in [current, *current.parents]:
            amp_dir = candidate / ".amp"
            if (amp_dir / "amp.yaml").exists():
                return cls(amp_dir)
        raise StoreNotFoundError(
            "No .amp store found in this directory or any parent. Run `amp init` first."
        )

    @property
    def manifest_path(self) -> Path:
        return self.root / "amp.yaml"

    @property
    def nodes_dir(self) -> Path:
        return self.root / "nodes"

    @property
    def daily_dir(self) -> Path:
        return self.root / "daily"

    @property
    def index_dir(self) -> Path:
        return self.root / "index"

    @property
    def history_dir(self) -> Path:
        return self.root / ".history"

    @property
    def changelog_path(self) -> Path:
        return self.history_dir / "changelog.jsonl"

    def exists(self) -> bool:
        return self.manifest_path.exists()

    def _require_exists(self) -> None:
        if not self.exists():
            raise StoreNotFoundError(
                f"No AMP store found at {self.root}. Run `amp init` first."
            )

    # ------------------------------------------------------------------
    # Manifest / init
    # ------------------------------------------------------------------

    def load_manifest(self) -> dict[str, Any]:
        self._require_exists()
        with open(self.manifest_path, "r", encoding="utf-8") as fh:
            return yaml.safe_load(fh) or {}

    def save_manifest(self, manifest: dict[str, Any]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with open(self.manifest_path, "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh, sort_keys=False, allow_unicode=True)

    def init(
        self,
        name: str,
        agent_id: str,
        agent_name: Optional[str] = None,
        description: str = "",
        store_id: Optional[str] = None,
        default_scope: str = "agent",
        force: bool = False,
    ) -> dict[str, Any]:
        if self.exists() and not force:
            raise StoreExistsError(f"An AMP store already exists at {self.root}")

        for sub in ("facts", "episodes", "preferences", "procedures", "reflections"):
            (self.nodes_dir / sub).mkdir(parents=True, exist_ok=True)
        self.daily_dir.mkdir(parents=True, exist_ok=True)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        (self.index_dir / "embeddings").mkdir(parents=True, exist_ok=True)
        self.history_dir.mkdir(parents=True, exist_ok=True)

        manifest = {
            "amp": AMP_VERSION,
            "store": {
                "id": store_id or f"store_{slugify(name, max_words=3)}",
                "name": name,
                "created": now_iso(),
            },
            "agent": {
                "id": agent_id,
                "name": agent_name or agent_id,
                "description": description,
            },
            "settings": {
                "default_scope": default_scope,
                "auto_index": True,
                "daily_retention": 30,
            },
        }
        self.save_manifest(manifest)

        if not self.changelog_path.exists():
            self.changelog_path.write_text("", encoding="utf-8")

        # Empty index files so a fresh store is immediately valid.
        index_mod.write_index(self.index_dir, [])
        self._log("init", store_id=manifest["store"]["id"])
        return manifest

    # ------------------------------------------------------------------
    # Changelog
    # ------------------------------------------------------------------

    def _log(self, op: str, **fields: Any) -> None:
        self.history_dir.mkdir(parents=True, exist_ok=True)
        entry = {"ts": now_iso(), "op": op, **fields}
        with open(self.changelog_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, sort_keys=True) + "\n")

    # ------------------------------------------------------------------
    # Node loading helpers
    # ------------------------------------------------------------------

    def _all_node_paths(self) -> list[Path]:
        return list(iter_node_files(self.nodes_dir))

    def _all_nodes(self) -> list[Node]:
        nodes = []
        for path in self._all_node_paths():
            try:
                nodes.append(read_node(path))
            except Exception:
                continue
        return nodes

    def _find_node_path(self, node_id: str) -> Optional[Path]:
        for path in self._all_node_paths():
            if path.stem == node_id or path.stem.endswith(f"-{node_id}"):
                node = read_node(path)
                if node.id == node_id:
                    return path
        return None

    def _agent_author(self) -> str:
        manifest = self.load_manifest()
        agent_id = manifest.get("agent", {}).get("id", "agent")
        return f"agent:{agent_id}"

    def _auto_index_enabled(self) -> bool:
        manifest = self.load_manifest()
        return bool(manifest.get("settings", {}).get("auto_index", True))

    def _maybe_reindex(self) -> None:
        if self._auto_index_enabled():
            self.reindex()

    # ------------------------------------------------------------------
    # Classification / ID generation
    # ------------------------------------------------------------------

    @staticmethod
    def classify(content: str) -> str:
        text = content.lower()
        if any(kw in text for kw in ("how to", "steps", "step 1", "procedure", "instructions")):
            return "procedure"
        if any(kw in text for kw in ("always", "never", "rule", "in general", "learned that")):
            return "reflection"
        if any(kw in text for kw in ("prefer", "like to", "dislike", "favorite", "rather")):
            return "preference"
        if any(kw in text for kw in ("deployed", "happened", "yesterday", "today", "met with", "occurred")):
            return "episode"
        return "fact"

    def _unique_id(self, base_id: str) -> str:
        existing = {node.id for node in self._all_nodes()}
        if base_id not in existing:
            return base_id
        n = 2
        while f"{base_id}-{n}" in existing:
            n += 1
        return f"{base_id}-{n}"

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    def store(
        self,
        content: str,
        type: Optional[str] = None,
        tags: Optional[list[str]] = None,
        confidence: Optional[float] = None,
        source: Optional[str] = None,
        scope: Optional[str] = None,
        author: Optional[str] = None,
        id: Optional[str] = None,
        links: Optional[list[dict[str, str]]] = None,
        status: str = "active",
    ) -> Node:
        self._require_exists()
        node_type = type or self.classify(content)
        if node_type not in NODE_TYPES:
            raise AmpError(f"Unknown type '{node_type}'. Must be one of {NODE_TYPES}")

        base_id = id or slugify(content)
        node_id = self._unique_id(base_id)

        ts = now_iso()
        manifest = self.load_manifest()

        node = Node(
            id=node_id,
            type=node_type,
            created=ts,
            modified=ts,
            author=author or self._agent_author(),
            status=status,
            source=source,
            confidence=confidence,
            tags=list(tags or []),
            scope=scope or manifest.get("settings", {}).get("default_scope", "agent"),
            links=[Link.from_dict(l) if isinstance(l, dict) else l for l in (links or [])],
            content=self._render_content(content, node_id),
        )
        write_node(self.nodes_dir, node, date=ts)
        self._log("store", id=node.id, type=node.type)
        self._maybe_reindex()
        return node

    @staticmethod
    def _render_content(content: str, node_id: str) -> str:
        content = content.strip()
        if content.startswith("#"):
            return content + "\n"
        title = node_id.replace("-", " ").title()
        return f"# {title}\n\n{content}\n"

    def show(self, node_id: str) -> Node:
        self._require_exists()
        path = self._find_node_path(node_id)
        if not path:
            raise NodeNotFoundError(f"No node with id '{node_id}'")
        return read_node(path)

    def list(
        self,
        type: Optional[str] = None,
        status: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> list[Node]:
        self._require_exists()
        nodes = self._all_nodes()
        if type:
            nodes = [n for n in nodes if n.type == type]
        if status:
            nodes = [n for n in nodes if n.status == status]
        if tag:
            nodes = [n for n in nodes if tag in n.tags]
        nodes.sort(key=lambda n: n.modified, reverse=True)
        return nodes

    def search(
        self,
        query: str,
        type: Optional[str] = None,
        status: Optional[str] = None,
        tag: Optional[str] = None,
        since: Optional[str] = None,
    ) -> list[Node]:
        self._require_exists()
        nodes = self._all_nodes()
        if type:
            nodes = [n for n in nodes if n.type == type]
        if status:
            nodes = [n for n in nodes if n.status == status]
        if tag:
            nodes = [n for n in nodes if tag in n.tags]
        if since:
            since_dt = parse_date(since)
            filtered = []
            for n in nodes:
                try:
                    if parse_date(n.modified) >= since_dt:
                        filtered.append(n)
                except ValueError:
                    continue
            nodes = filtered

        if query:
            q = query.lower().strip()
            terms = [t for t in q.split() if t]
            scored = []
            for n in nodes:
                haystack = " ".join(
                    [n.id, n.content, " ".join(n.tags), n.type]
                ).lower()
                if q in haystack:
                    score = 10  # exact phrase match bonus
                else:
                    score = 0
                score += sum(haystack.count(t) for t in terms)
                if score > 0:
                    scored.append((score, n))
            scored.sort(key=lambda pair: pair[0], reverse=True)
            nodes = [n for _, n in scored]
        else:
            nodes.sort(key=lambda n: n.modified, reverse=True)
        return nodes

    def recall(
        self,
        context: str,
        limit: int = 10,
        include_statuses: Optional[list[str]] = None,
    ) -> list[Node]:
        self._require_exists()
        include_statuses = include_statuses or ["active", "disputed"]
        words = [w for w in _tokenize(context) if w]
        if not words:
            return []

        results: list[RecallResult] = []
        for node in self._all_nodes():
            if node.status not in include_statuses:
                continue
            content_tokens = _tokenize(node.content)
            tag_tokens = [t.lower() for t in node.tags]
            id_tokens = _tokenize(node.id.replace("-", " "))

            score = 0.0
            for w in words:
                score += content_tokens.count(w) * 1.0
                if w in tag_tokens:
                    score += 3.0
                if w in id_tokens:
                    score += 2.0
            if score <= 0:
                continue
            if node.confidence:
                score *= 0.5 + 0.5 * node.confidence
            results.append(RecallResult(node=node, score=score))

        results.sort(key=lambda r: r.score, reverse=True)
        return [r.node for r in results[:limit]]

    def update(
        self,
        node_id: str,
        content: Optional[str] = None,
        tags: Optional[list[str]] = None,
        add_tags: Optional[list[str]] = None,
        remove_tags: Optional[list[str]] = None,
        confidence: Optional[float] = None,
        status: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> Node:
        self._require_exists()
        path = self._find_node_path(node_id)
        if not path:
            raise NodeNotFoundError(f"No node with id '{node_id}'")
        node = read_node(path)

        if content is not None:
            node.content = self._render_content(content, node.id)
        if tags is not None:
            node.tags = list(tags)
        if add_tags:
            node.tags = sorted(set(node.tags) | set(add_tags))
        if remove_tags:
            node.tags = [t for t in node.tags if t not in remove_tags]
        if confidence is not None:
            node.confidence = confidence
        if status is not None:
            if status not in STATUS_VALUES:
                raise AmpError(f"Unknown status '{status}'. Must be one of {STATUS_VALUES}")
            node.status = status
        if scope is not None:
            node.scope = scope

        node.modified = now_iso()
        old_dir = path.parent
        write_node(self.nodes_dir, node, date=node.created)
        new_path = Path(node.path)
        if old_dir != new_path.parent or path.name != new_path.name:
            if path.exists() and path != new_path:
                path.unlink()
        self._log("update", id=node.id)
        self._maybe_reindex()
        return node

    def archive(self, node_id: str) -> Node:
        return self.update(node_id, status="archived")

    def merge(self, id1: str, id2: str) -> Node:
        self._require_exists()
        primary_path = self._find_node_path(id1)
        secondary_path = self._find_node_path(id2)
        if not primary_path:
            raise NodeNotFoundError(f"No node with id '{id1}'")
        if not secondary_path:
            raise NodeNotFoundError(f"No node with id '{id2}'")

        primary = read_node(primary_path)
        secondary = read_node(secondary_path)

        merged_body = primary.content.rstrip() + (
            f"\n\n## Merged from {secondary.id}\n\n" + secondary.content.strip() + "\n"
        )
        primary.content = merged_body
        primary.tags = sorted(set(primary.tags) | set(secondary.tags))
        existing_targets = {l.target for l in primary.links}
        for link in secondary.links:
            if link.target not in existing_targets:
                primary.links.append(link)
                existing_targets.add(link.target)
        if primary.confidence is not None and secondary.confidence is not None:
            primary.confidence = max(primary.confidence, secondary.confidence)
        elif secondary.confidence is not None:
            primary.confidence = secondary.confidence
        primary.modified = now_iso()
        write_node(self.nodes_dir, primary, date=primary.created)

        secondary.status = "superseded"
        secondary.superseded_by = primary.id
        secondary.modified = now_iso()
        write_node(self.nodes_dir, secondary, date=secondary.created)

        self._log("merge", id=primary.id, absorbed=secondary.id)
        self._maybe_reindex()
        return primary

    def prune(
        self,
        stale_days: Optional[int] = None,
        low_confidence: Optional[float] = None,
        dry_run: bool = False,
    ) -> list[Node]:
        self._require_exists()
        if stale_days is None and low_confidence is None:
            return []

        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        candidates: list[Node] = []
        for node in self._all_nodes():
            if node.status != "active":
                continue
            is_stale = False
            is_low_conf = False
            if stale_days is not None:
                try:
                    modified_dt = parse_date(node.modified)
                    is_stale = (now - modified_dt).days >= stale_days
                except ValueError:
                    is_stale = False
            if low_confidence is not None and node.confidence is not None:
                is_low_conf = node.confidence < low_confidence

            if is_stale or is_low_conf:
                candidates.append(node)

        if not dry_run:
            for node in candidates:
                path = self._find_node_path(node.id)
                if path and path.exists():
                    path.unlink()
                self._log("prune", id=node.id)
            self._maybe_reindex()

        return candidates

    # ------------------------------------------------------------------
    # Daily notes / distill
    # ------------------------------------------------------------------

    def distill(self, date: Optional[str] = None) -> dict[str, Any]:
        self._require_exists()
        day = date or today_str()
        path = self.daily_dir / f"{day}.md"
        if not path.exists():
            raise NodeNotFoundError(f"No daily note found for {day}")

        import frontmatter as fm_lib

        post = fm_lib.load(str(path))
        post.metadata["status"] = "distilled"
        path.write_text(fm_lib.dumps(post) + "\n", encoding="utf-8")

        self._log("distill", date=day)
        return {"date": day, "status": "distilled", "path": str(path)}

    def create_daily_note(self, date: Optional[str] = None, agent: Optional[str] = None) -> Path:
        self._require_exists()
        day = date or today_str()
        self.daily_dir.mkdir(parents=True, exist_ok=True)
        path = self.daily_dir / f"{day}.md"
        if path.exists():
            return path
        manifest = self.load_manifest()
        agent_id = agent or manifest.get("agent", {}).get("id", "agent")
        content = (
            "---\n"
            f"date: {day}\n"
            f"agent: {agent_id}\n"
            "status: pending\n"
            "---\n"
            f"# {day}\n\n## Conversations\n"
        )
        path.write_text(content, encoding="utf-8")
        return path

    # ------------------------------------------------------------------
    # Index
    # ------------------------------------------------------------------

    def reindex(self) -> tuple[dict, dict]:
        self._require_exists()
        nodes = self._all_nodes()
        keywords, graph = index_mod.write_index(self.index_dir, nodes)
        self._log("reindex", node_count=len(nodes))
        return keywords, graph

    # ------------------------------------------------------------------
    # Portability
    # ------------------------------------------------------------------

    def export(self, format: str = "amp") -> Any:
        self._require_exists()
        if format == "json":
            return self._export_json()
        if format == "markdown":
            return self._export_markdown()
        if format == "amp":
            return self._export_amp_tree()
        raise AmpError(f"Unknown export format '{format}'. Use amp, json, or markdown.")

    def _export_json(self) -> dict[str, Any]:
        manifest = self.load_manifest()
        nodes = [n.frontmatter() | {"content": n.content} for n in self._all_nodes()]
        daily = []
        if self.daily_dir.exists():
            for path in sorted(self.daily_dir.glob("*.md")):
                import frontmatter as fm_lib

                post = fm_lib.load(str(path))
                daily.append({**post.metadata, "content": post.content, "filename": path.name})
        return {"amp": AMP_VERSION, "manifest": manifest, "nodes": nodes, "daily": daily}

    def _export_markdown(self) -> str:
        manifest = self.load_manifest()
        parts = [f"# {manifest.get('store', {}).get('name', 'AMP Memory Store')}\n"]
        for node in sorted(self._all_nodes(), key=lambda n: n.id):
            parts.append(f"---\n\n## {node.id} ({node.type}, {node.status})\n")
            if node.tags:
                parts.append(f"Tags: {', '.join(node.tags)}\n")
            parts.append(node.content.strip() + "\n")
        return "\n".join(parts)

    def _export_amp_tree(self) -> Path:
        return self.root

    def export_to_path(self, dest: str | Path, format: str = "amp") -> Path:
        dest_path = Path(dest)
        if format == "amp":
            if dest_path.exists():
                shutil.rmtree(dest_path)
            shutil.copytree(self.root, dest_path)
            return dest_path
        if format == "json":
            dest_path.write_text(
                json.dumps(self._export_json(), indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            return dest_path
        if format == "markdown":
            dest_path.write_text(self._export_markdown(), encoding="utf-8")
            return dest_path
        raise AmpError(f"Unknown export format '{format}'. Use amp, json, or markdown.")

    def import_data(self, source: str | Path, overwrite: bool = False) -> int:
        self._require_exists()
        source_path = Path(source)
        with open(source_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        nodes = data.get("nodes", [])
        count = 0
        for raw in nodes:
            raw = dict(raw)
            content = raw.pop("content", "")
            node_id = raw.get("id") or slugify(content)
            if not overwrite and self._find_node_path(node_id):
                continue
            node = Node(
                id=node_id,
                type=raw.get("type", "fact"),
                created=raw.get("created", now_iso()),
                modified=raw.get("modified", now_iso()),
                author=raw.get("author", self._agent_author()),
                status=raw.get("status", "active"),
                source=raw.get("source"),
                confidence=raw.get("confidence"),
                tags=list(raw.get("tags") or []),
                scope=raw.get("scope"),
                superseded_by=raw.get("superseded_by"),
                ttl=raw.get("ttl"),
                links=[Link.from_dict(l) for l in raw.get("links", [])],
                content=content,
            )
            write_node(self.nodes_dir, node, date=node.created)
            count += 1

        for daily in data.get("daily", []):
            filename = daily.get("filename") or f"{daily.get('date', today_str())}.md"
            path = self.daily_dir / filename
            if path.exists() and not overwrite:
                continue
            meta = {k: v for k, v in daily.items() if k not in ("content", "filename")}
            body = daily.get("content", "")
            fm_text = yaml.safe_dump(meta, sort_keys=False, allow_unicode=True)
            path.write_text(f"---\n{fm_text}---\n{body}", encoding="utf-8")

        self._log("import", count=count, source=str(source_path))
        self._maybe_reindex()
        return count

    # ------------------------------------------------------------------
    # Validate / stats
    # ------------------------------------------------------------------

    def validate(self) -> list[ValidationIssue]:
        self._require_exists()
        issues: list[ValidationIssue] = []

        try:
            manifest = self.load_manifest()
        except Exception as exc:
            issues.append(ValidationIssue("error", f"Could not parse amp.yaml: {exc}"))
            return issues

        if manifest.get("amp") != AMP_VERSION:
            issues.append(
                ValidationIssue(
                    "warning",
                    f"amp.yaml version '{manifest.get('amp')}' differs from supported '{AMP_VERSION}'",
                )
            )
        for key in ("store", "agent", "settings"):
            if key not in manifest:
                issues.append(ValidationIssue("error", f"amp.yaml missing top-level key '{key}'"))

        seen_ids: dict[str, str] = {}
        all_nodes = self._all_nodes()
        node_ids = {n.id for n in all_nodes}

        for path in self._all_node_paths():
            try:
                node = read_node(path)
            except Exception as exc:
                issues.append(ValidationIssue("error", f"Could not parse {path}: {exc}", None))
                continue

            for field_name in ("id", "type", "created", "modified", "author", "status"):
                if not getattr(node, field_name, None):
                    issues.append(
                        ValidationIssue("error", f"Missing required field '{field_name}'", node.id)
                    )

            if node.type not in NODE_TYPES:
                issues.append(ValidationIssue("error", f"Invalid type '{node.type}'", node.id))
            if node.status not in STATUS_VALUES:
                issues.append(ValidationIssue("error", f"Invalid status '{node.status}'", node.id))
            if node.scope is not None and node.scope not in SCOPE_VALUES:
                issues.append(ValidationIssue("error", f"Invalid scope '{node.scope}'", node.id))

            expected_dir = type_dir(self.nodes_dir, node.type)
            if path.parent.resolve() != expected_dir.resolve():
                issues.append(
                    ValidationIssue(
                        "warning",
                        f"Node file located in '{path.parent.name}/' but type is '{node.type}'",
                        node.id,
                    )
                )

            expected_name = node_filename(node.id, node.type, date=node.created)
            if path.name != expected_name and not path.name.endswith(f"-{node.id}.md"):
                if path.stem != node.id:
                    issues.append(
                        ValidationIssue(
                            "warning",
                            f"Filename '{path.name}' does not match id '{node.id}'",
                            node.id,
                        )
                    )

            if node.id in seen_ids:
                issues.append(
                    ValidationIssue(
                        "error", f"Duplicate id also used by {seen_ids[node.id]}", node.id
                    )
                )
            else:
                seen_ids[node.id] = str(path)

            for link in node.links:
                if link.relation not in LINK_RELATIONS:
                    issues.append(
                        ValidationIssue(
                            "warning", f"Unknown link relation '{link.relation}'", node.id
                        )
                    )
                if link.target not in node_ids:
                    issues.append(
                        ValidationIssue(
                            "warning", f"Link target '{link.target}' does not exist", node.id
                        )
                    )

            for target in extract_wikilinks(node.content):
                if target not in node_ids:
                    issues.append(
                        ValidationIssue(
                            "warning", f"Wikilink target '{target}' does not exist", node.id
                        )
                    )

            if node.status == "superseded" and not node.superseded_by:
                issues.append(
                    ValidationIssue(
                        "warning", "Status is 'superseded' but 'superseded_by' is not set", node.id
                    )
                )

        return issues

    def stats(self) -> dict[str, Any]:
        self._require_exists()
        nodes = self._all_nodes()
        manifest = self.load_manifest()

        by_type: dict[str, int] = {}
        by_status: dict[str, int] = {}
        by_scope: dict[str, int] = {}
        tag_counts: dict[str, int] = {}
        confidences = []

        for node in nodes:
            by_type[node.type] = by_type.get(node.type, 0) + 1
            by_status[node.status] = by_status.get(node.status, 0) + 1
            if node.scope:
                by_scope[node.scope] = by_scope.get(node.scope, 0) + 1
            for tag in node.tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
            if node.confidence is not None:
                confidences.append(node.confidence)

        daily_count = 0
        if self.daily_dir.exists():
            daily_count = len(list(self.daily_dir.glob("*.md")))

        top_tags = sorted(tag_counts.items(), key=lambda kv: kv[1], reverse=True)[:10]
        dates = sorted(n.created for n in nodes if n.created)

        return {
            "store_name": manifest.get("store", {}).get("name"),
            "agent_id": manifest.get("agent", {}).get("id"),
            "total_nodes": len(nodes),
            "by_type": by_type,
            "by_status": by_status,
            "by_scope": by_scope,
            "top_tags": top_tags,
            "average_confidence": (sum(confidences) / len(confidences)) if confidences else None,
            "daily_notes": daily_count,
            "oldest_node": dates[0] if dates else None,
            "newest_node": dates[-1] if dates else None,
        }


def _tokenize(text: str) -> list[str]:
    import re

    return re.findall(r"[a-z0-9][a-z0-9_+-]*", text.lower())
