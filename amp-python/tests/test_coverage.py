"""Additional tests to push amp-python to 100% statement + branch coverage.

These tests complement tests/test_basic.py by exercising:
  - CLI commands and their error paths via click.testing.CliRunner
  - AmpStore edge cases and internal branches not hit by the happy-path tests
  - node.py / types.py / util.py / index.py helper functions directly
  - commands/_common.py shared rendering & error-handling helpers
"""

from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path

import pytest
import yaml
from click.testing import CliRunner

from amp import AmpStore, Node, NodeNotFoundError, StoreNotFoundError
from amp.cli import main
from amp.store import AmpError, NodeExistsError, StoreExistsError, ValidationIssue
from amp import index as index_mod
from amp import node as node_mod
from amp import util as util_mod
from amp.types import Link


@pytest.fixture()
def store(tmp_path: Path) -> AmpStore:
    s = AmpStore(tmp_path / ".amp")
    s.init(name="Test Memory", agent_id="tester")
    return s


def write_raw_node(store: AmpStore, subdir: str, filename: str, frontmatter: dict, body: str = "Body.\n") -> Path:
    """Write a node file directly to disk, bypassing AmpStore.store(), so we can
    construct edge-case / malformed nodes for validate()/read_node() tests."""
    directory = store.nodes_dir / subdir
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / filename
    fm_text = yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True)
    path.write_text(f"---\n{fm_text}---\n{body}", encoding="utf-8")
    return path


# ---------------------------------------------------------------------
# util.py
# ---------------------------------------------------------------------


def test_today_str_format():
    result = util_mod.today_str()
    assert len(result) == 10
    assert result.count("-") == 2


def test_parse_date_all_formats():
    d1 = util_mod.parse_date("2026-04-18T10:30:00Z")
    assert d1.year == 2026 and d1.month == 4 and d1.day == 18

    d2 = util_mod.parse_date("2026-04-18T10:30:00")
    assert d2.hour == 10

    d3 = util_mod.parse_date("2026-04-18")
    assert d3.day == 18

    # Falls through all strptime formats to fromisoformat fallback.
    d4 = util_mod.parse_date("2026-04-18T10:30:00+05:00")
    assert d4.year == 2026

    # Leading/trailing whitespace is stripped.
    d5 = util_mod.parse_date("  2026-04-18  ")
    assert d5.day == 18


# ---------------------------------------------------------------------
# types.py
# ---------------------------------------------------------------------


def test_link_to_dict_and_from_dict():
    link = Link(target="other-node", relation="supports")
    assert link.to_dict() == {"target": "other-node", "relation": "supports"}

    from_dict = Link.from_dict({"target": "other-node", "relation": "contradicts"})
    assert from_dict.target == "other-node"
    assert from_dict.relation == "contradicts"

    # Missing relation defaults to relates_to.
    default_relation = Link.from_dict({"target": "x"})
    assert default_relation.relation == "relates_to"


def test_node_frontmatter_all_optional_fields():
    node = Node(
        id="n1",
        type="fact",
        created="2026-01-01T00:00:00Z",
        modified="2026-01-01T00:00:00Z",
        author="agent:tester",
        source="conversation:abc",
        confidence=0.9,
        tags=["a", "b"],
        scope="team",
        superseded_by="other-node",
        ttl="30d",
        links=[Link(target="other-node", relation="supports")],
        content="Body",
        extra={"custom_field": "value"},
    )
    fm = node.frontmatter()
    assert fm["source"] == "conversation:abc"
    assert fm["confidence"] == 0.9
    assert fm["tags"] == ["a", "b"]
    assert fm["scope"] == "team"
    assert fm["superseded_by"] == "other-node"
    assert fm["ttl"] == "30d"
    assert fm["links"] == [{"target": "other-node", "relation": "supports"}]
    assert fm["custom_field"] == "value"


def test_node_frontmatter_minimal_fields():
    node = Node(
        id="n2",
        type="fact",
        created="2026-01-01T00:00:00Z",
        modified="2026-01-01T00:00:00Z",
        author="agent:tester",
    )
    fm = node.frontmatter()
    assert "source" not in fm
    assert "confidence" not in fm
    assert "tags" not in fm
    assert "scope" not in fm
    assert "superseded_by" not in fm
    assert "ttl" not in fm
    assert "links" not in fm


def test_node_to_summary():
    node = Node(
        id="n3",
        type="preference",
        created="2026-01-01T00:00:00Z",
        modified="2026-01-02T00:00:00Z",
        author="agent:tester",
        status="active",
        tags=["x"],
        confidence=0.5,
        scope="agent",
    )
    summary = node.to_summary()
    assert summary == {
        "id": "n3",
        "type": "preference",
        "status": "active",
        "tags": ["x"],
        "confidence": 0.5,
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-02T00:00:00Z",
        "scope": "agent",
    }


# ---------------------------------------------------------------------
# node.py
# ---------------------------------------------------------------------


def test_node_filename_episode_with_prefix_needed():
    name = node_mod.node_filename("standup-notes", "episode", date="2026-04-18T00:00:00Z")
    assert name == "2026-04-18-standup-notes.md"


def test_node_filename_episode_already_prefixed():
    name = node_mod.node_filename("2026-04-18-standup-notes", "episode", date="2026-04-18T00:00:00Z")
    assert name == "2026-04-18-standup-notes.md"


def test_node_filename_non_episode():
    name = node_mod.node_filename("some-fact", "fact", date="2026-04-18T00:00:00Z")
    assert name == "some-fact.md"


def test_node_filename_episode_without_date():
    name = node_mod.node_filename("some-episode", "episode", date=None)
    assert name == "some-episode.md"


def test_parse_links_mixed_and_empty():
    assert node_mod.parse_links(None) == []
    assert node_mod.parse_links([]) == []

    links = node_mod.parse_links([{"target": "a", "relation": "supports"}, "b", {"no_target": True}])
    assert len(links) == 2
    assert links[0].target == "a" and links[0].relation == "supports"
    assert links[1].target == "b" and links[1].relation == "relates_to"


def test_iter_node_files_missing_dir(tmp_path: Path):
    result = list(node_mod.iter_node_files(tmp_path / "does-not-exist"))
    assert result == []


def test_title_from_content_with_heading():
    assert node_mod.title_from_content("# My Great Title\n\nBody text", "fallback-id") == "My Great Title"


def test_title_from_content_without_heading():
    assert node_mod.title_from_content("Just plain text, no heading.", "my-fallback-id") == "My Fallback Id"


def test_slugify_only_stopwords_falls_back():
    # All words are stopwords, so `significant` is empty and we fall back to `words`.
    assert node_mod.slugify("the a an") == "the-a-an"


def test_slugify_empty_returns_note():
    assert node_mod.slugify("!!!") == "note"


def test_store_and_show_links_roundtrip(store: AmpStore):
    a = store.store("First node", type="fact")
    b = store.store(
        "Second node links to first",
        type="fact",
        links=[{"target": a.id, "relation": "supports"}],
    )
    fetched = store.show(b.id)
    assert len(fetched.links) == 1
    assert fetched.links[0].target == a.id
    assert fetched.links[0].relation == "supports"


def test_store_episode_node_uses_date_prefix(store: AmpStore):
    node = store.store("We deployed the new API yesterday", type="episode", id="deploy-day")
    assert node.path is not None
    assert Path(node.path).name.startswith(node.created[:10])


# ---------------------------------------------------------------------
# index.py
# ---------------------------------------------------------------------


def test_build_keywords_empty_content_node():
    node = Node(id="empty1", type="fact", created="t", modified="t", author="a", content="   ")
    result = index_mod.build_keywords([node])
    assert result["empty1"] == []


def test_build_graph_with_links_and_duplicate_wikilink():
    linked = Node(
        id="target1",
        type="fact",
        created="t",
        modified="t",
        author="a",
        content="Target content",
    )
    source = Node(
        id="source1",
        type="fact",
        created="t",
        modified="t",
        author="a",
        content="See [[target1]] for details.",
        links=[Link(target="target1", relation="supports")],
    )
    graph = index_mod.build_graph([source, linked])
    outgoing = graph["outgoing"]["source1"]
    # Only one entry for target1 since the wikilink duplicate is skipped.
    assert len([e for e in outgoing if e["target"] == "target1"]) == 1
    assert graph["incoming"]["target1"][0]["source"] == "source1"


def test_build_graph_incoming_for_dangling_target():
    node = Node(
        id="src2",
        type="fact",
        created="t",
        modified="t",
        author="a",
        content="Body",
        links=[Link(target="nonexistent-node", relation="relates_to")],
    )
    graph = index_mod.build_graph([node])
    assert graph["incoming"]["nonexistent-node"] == []


# ---------------------------------------------------------------------
# store.py — discovery
# ---------------------------------------------------------------------


def test_discover_walks_up_parents(tmp_path: Path):
    s = AmpStore(tmp_path / ".amp")
    s.init(name="Nested", agent_id="tester")
    nested = tmp_path / "a" / "b" / "c"
    nested.mkdir(parents=True)
    found = AmpStore.discover(nested)
    assert found.root.resolve() == s.root.resolve()


def test_find_node_path_skips_stem_match_with_different_id(store: AmpStore):
    # Craft a file whose stem matches the lookup pattern but whose actual `id`
    # frontmatter field differs, forcing _find_node_path's loop to continue past
    # a false-positive stem match instead of returning early.
    write_raw_node(
        store,
        "facts",
        "prefix-123.md",
        {
            "id": "totally-different-id",
            "type": "fact",
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z",
            "author": "agent:tester",
            "status": "active",
        },
    )
    # No file actually has id "123", so this should resolve to None without
    # raising, having exercised the loop-continues-past-mismatch branch.
    assert store._find_node_path("123") is None


def test_discover_not_found_raises(tmp_path: Path):
    empty_dir = tmp_path / "nowhere"
    empty_dir.mkdir()
    with pytest.raises(StoreNotFoundError):
        AmpStore.discover(empty_dir)


# ---------------------------------------------------------------------
# store.py — init
# ---------------------------------------------------------------------


def test_init_twice_without_force_raises(tmp_path: Path):
    s = AmpStore(tmp_path / ".amp")
    s.init(name="Once", agent_id="tester")
    with pytest.raises(StoreExistsError):
        s.init(name="Twice", agent_id="tester")


def test_init_with_force_reinitializes(tmp_path: Path):
    s = AmpStore(tmp_path / ".amp")
    s.init(name="Once", agent_id="tester")
    # changelog already exists at this point; force-reinit must not blow up
    # when re-running (covers the "changelog already exists" branch).
    manifest = s.init(name="Twice", agent_id="tester2", force=True)
    assert manifest["agent"]["id"] == "tester2"


# ---------------------------------------------------------------------
# store.py — corrupt / malformed node files
# ---------------------------------------------------------------------


def test_all_nodes_skips_unparseable_file(store: AmpStore):
    good = store.store("A perfectly fine fact", type="fact")
    bad_path = store.nodes_dir / "facts" / "corrupt.md"
    bad_path.write_text("---\nid: [unterminated\n---\nBody\n", encoding="utf-8")

    nodes = store.list()
    ids = {n.id for n in nodes}
    assert good.id in ids
    assert len(nodes) == 1  # corrupt file silently skipped


def test_validate_reports_unparseable_file(store: AmpStore):
    bad_path = store.nodes_dir / "facts" / "corrupt2.md"
    bad_path.write_text("---\nid: [unterminated\n---\nBody\n", encoding="utf-8")
    issues = store.validate()
    assert any("Could not parse" in i.message for i in issues)


# ---------------------------------------------------------------------
# store.py — _unique_id collision chain
# ---------------------------------------------------------------------


def test_unique_id_triple_collision(store: AmpStore):
    n1 = store.store("Same content here", type="fact", id="dup")
    n2 = store.store("Same content here", type="fact", id="dup")
    n3 = store.store("Same content here", type="fact", id="dup")
    ids = {n1.id, n2.id, n3.id}
    assert len(ids) == 3
    assert "dup" in ids and "dup-2" in ids and "dup-3" in ids


# ---------------------------------------------------------------------
# store.py — store() edge cases
# ---------------------------------------------------------------------


def test_store_unknown_type_raises(store: AmpStore):
    with pytest.raises(AmpError):
        store.store("Some content", type="not-a-real-type")


def test_store_content_with_heading_preserved(store: AmpStore):
    node = store.store("# Custom Heading\n\nSome body text", type="fact")
    assert node.content.startswith("# Custom Heading")
    assert node.content.count("# Custom Heading") == 1


def test_store_auto_index_disabled_skips_reindex(tmp_path: Path):
    s = AmpStore(tmp_path / ".amp")
    s.init(name="NoAutoIndex", agent_id="tester")
    manifest = s.load_manifest()
    manifest["settings"]["auto_index"] = False
    s.save_manifest(manifest)

    before = (s.index_dir / "keywords.json").read_text(encoding="utf-8")
    s.store("Something new", type="fact")
    after = (s.index_dir / "keywords.json").read_text(encoding="utf-8")
    assert before == after  # reindex never ran


# ---------------------------------------------------------------------
# store.py — list / search filters
# ---------------------------------------------------------------------


def test_list_status_filter(store: AmpStore):
    n = store.store("Archive me", type="fact")
    store.archive(n.id)
    store.store("Stay active", type="fact")

    archived = store.list(status="archived")
    assert len(archived) == 1
    assert archived[0].id == n.id


def test_search_status_and_tag_filters(store: AmpStore):
    n1 = store.store("Alpha content", type="fact", tags=["keep"])
    n2 = store.store("Beta content", type="fact", tags=["drop"])
    store.archive(n2.id)

    results = store.search("", status="active")
    assert all(n.status == "active" for n in results)
    assert n1.id in {n.id for n in results}

    results = store.search("", tag="keep")
    assert len(results) == 1
    assert results[0].id == n1.id


def test_search_since_filters_by_date(store: AmpStore):
    store.store("Old-ish content", type="fact")
    results = store.search("", since="2020-01-01")
    assert len(results) >= 1

    results = store.search("", since="2999-01-01")
    assert results == []


def test_search_since_skips_unparseable_modified(store: AmpStore):
    store.store("Fine content", type="fact")
    bad_path = store.nodes_dir / "facts" / "badmodified.md"
    bad_path.write_text(
        "---\nid: badmodified\ntype: fact\ncreated: 2026-01-01T00:00:00Z\n"
        "modified: not-a-real-date\nauthor: agent:tester\nstatus: active\n---\nBody\n",
        encoding="utf-8",
    )
    # Should not raise even though one node has an unparseable `modified` field.
    results = store.search("", since="2020-01-01")
    assert all(n.id != "badmodified" for n in results)


# ---------------------------------------------------------------------
# store.py — recall
# ---------------------------------------------------------------------


def test_recall_no_words_returns_empty(store: AmpStore):
    store.store("Something", type="fact")
    assert store.recall("!!! ??? ...") == []


def test_recall_excludes_non_matching_and_wrong_status(store: AmpStore):
    relevant = store.store("Python backend services are great", type="fact", tags=["python"])
    irrelevant = store.store("Completely unrelated topic zzz", type="fact")
    archived = store.store("Python archived note", type="fact")
    store.archive(archived.id)

    results = store.recall("python backend")
    ids = {n.id for n in results}
    assert relevant.id in ids
    assert irrelevant.id not in ids
    assert archived.id not in ids  # excluded by default include_statuses


def test_recall_confidence_weighting(store: AmpStore):
    store.store("Weighted python fact", type="fact", tags=["python"], confidence=0.9)
    store.store("Zero confidence python fact", type="fact", tags=["python"], confidence=0.0)
    results = store.recall("python")
    assert len(results) >= 1


# ---------------------------------------------------------------------
# store.py — update
# ---------------------------------------------------------------------


def test_update_only_tags_no_content(store: AmpStore):
    node = store.store("Original content", type="fact", tags=["x"])
    updated = store.update(node.id, tags=["y", "z"])
    assert set(updated.tags) == {"y", "z"}
    assert "Original content" in updated.content  # content untouched


def test_update_remove_tags(store: AmpStore):
    node = store.store("Has tags", type="fact", tags=["a", "b", "c"])
    updated = store.update(node.id, remove_tags=["b"])
    assert set(updated.tags) == {"a", "c"}


def test_update_scope(store: AmpStore):
    node = store.store("Scoped node", type="fact", scope="agent")
    updated = store.update(node.id, scope="team")
    assert updated.scope == "team"


def test_update_invalid_status_raises(store: AmpStore):
    node = store.store("Node", type="fact")
    with pytest.raises(AmpError):
        store.update(node.id, status="not-a-real-status")


def test_update_missing_node_raises(store: AmpStore):
    with pytest.raises(NodeNotFoundError):
        store.update("does-not-exist", tags=["x"])


def test_update_cleans_up_stale_path_when_misplaced(store: AmpStore):
    node = store.store("Misplaced node", type="fact", id="misplaced-fact")
    old_path = Path(node.path)
    wrong_dir = store.nodes_dir / "preferences"
    wrong_dir.mkdir(parents=True, exist_ok=True)
    new_wrong_path = wrong_dir / old_path.name
    old_path.rename(new_wrong_path)

    updated = store.update("misplaced-fact", add_tags=["moved"])
    correct_path = Path(updated.path)
    assert correct_path.parent == store.nodes_dir / "facts"
    assert not new_wrong_path.exists()
    assert correct_path.exists()


# ---------------------------------------------------------------------
# store.py — merge
# ---------------------------------------------------------------------


def test_update_skips_unlink_when_old_path_already_gone(store: AmpStore, monkeypatch):
    import pathlib

    node = store.store("Misplaced but vanished", type="fact", id="misplaced-vanished")
    old_path = Path(node.path)
    wrong_dir = store.nodes_dir / "preferences"
    wrong_dir.mkdir(parents=True, exist_ok=True)
    new_wrong_path = wrong_dir / old_path.name
    old_path.rename(new_wrong_path)

    original_exists = pathlib.Path.exists

    def fake_exists(self, *args, **kwargs):
        if self == new_wrong_path:
            return False
        return original_exists(self, *args, **kwargs)

    monkeypatch.setattr(pathlib.Path, "exists", fake_exists)

    updated = store.update("misplaced-vanished", add_tags=["moved"])
    assert Path(updated.path).exists()
    assert Path(updated.path).parent == store.nodes_dir / "facts"


def test_merge_missing_primary_raises(store: AmpStore):
    n2 = store.store("Secondary", type="fact")
    with pytest.raises(NodeNotFoundError):
        store.merge("missing-primary", n2.id)


def test_merge_missing_secondary_raises(store: AmpStore):
    n1 = store.store("Primary", type="fact")
    with pytest.raises(NodeNotFoundError):
        store.merge(n1.id, "missing-secondary")


def test_merge_links_deduplicated(store: AmpStore):
    other = store.store("Other target", type="fact")
    n1 = store.store("Primary node", type="fact", links=[{"target": other.id, "relation": "supports"}])
    n2 = store.store("Secondary node", type="fact", links=[{"target": other.id, "relation": "supports"}])
    merged = store.merge(n1.id, n2.id)
    targets = [l.target for l in merged.links]
    assert targets.count(other.id) == 1


def test_merge_links_new_target_appended(store: AmpStore):
    other1 = store.store("First target", type="fact")
    other2 = store.store("Second target", type="fact")
    n1 = store.store("Primary node", type="fact", links=[{"target": other1.id, "relation": "supports"}])
    n2 = store.store("Secondary node", type="fact", links=[{"target": other2.id, "relation": "relates_to"}])
    merged = store.merge(n1.id, n2.id)
    targets = {l.target for l in merged.links}
    assert targets == {other1.id, other2.id}


def test_merge_confidence_both_set_takes_max(store: AmpStore):
    n1 = store.store("Primary conf", type="fact", confidence=0.3)
    n2 = store.store("Secondary conf", type="fact", confidence=0.8)
    merged = store.merge(n1.id, n2.id)
    assert merged.confidence == 0.8


def test_merge_confidence_only_secondary_set(store: AmpStore):
    n1 = store.store("Primary no conf", type="fact")
    n2 = store.store("Secondary has conf", type="fact", confidence=0.5)
    merged = store.merge(n1.id, n2.id)
    assert merged.confidence == 0.5


def test_merge_confidence_neither_set(store: AmpStore):
    n1 = store.store("Primary no conf", type="fact")
    n2 = store.store("Secondary no conf", type="fact")
    merged = store.merge(n1.id, n2.id)
    assert merged.confidence is None


# ---------------------------------------------------------------------
# store.py — prune
# ---------------------------------------------------------------------


def test_prune_no_criteria_returns_empty(store: AmpStore):
    store.store("Anything", type="fact")
    assert store.prune() == []


def test_prune_skips_non_active_nodes(store: AmpStore):
    n = store.store("Archived before prune", type="fact", confidence=0.1)
    store.archive(n.id)
    candidates = store.prune(low_confidence=0.5, dry_run=True)
    assert all(c.id != n.id for c in candidates)


def test_prune_stale_days_with_old_modified(store: AmpStore):
    n = store.store("Old node", type="fact")
    path = Path(n.path)
    text = path.read_text(encoding="utf-8")
    text = text.replace(n.modified, "2000-01-01T00:00:00Z")
    path.write_text(text, encoding="utf-8")

    candidates = store.prune(stale_days=30, dry_run=True)
    assert any(c.id == n.id for c in candidates)


def test_prune_stale_days_unparseable_modified_is_safe(store: AmpStore):
    bad_path = store.nodes_dir / "facts" / "badstale.md"
    bad_path.write_text(
        "---\nid: badstale\ntype: fact\ncreated: 2026-01-01T00:00:00Z\n"
        "modified: not-a-date-at-all\nauthor: agent:tester\nstatus: active\n---\nBody\n",
        encoding="utf-8",
    )
    candidates = store.prune(stale_days=1, dry_run=True)
    assert all(c.id != "badstale" for c in candidates)


def test_prune_low_confidence_skips_node_without_confidence(store: AmpStore):
    store.store("No confidence set", type="fact")
    candidates = store.prune(low_confidence=0.9, dry_run=True)
    assert candidates == []


def test_prune_missing_path_is_handled(store: AmpStore, monkeypatch):
    node = store.store("Temp low-confidence fact", type="fact", confidence=0.1)
    monkeypatch.setattr(store, "_find_node_path", lambda node_id: None)
    pruned = store.prune(low_confidence=0.5, dry_run=False)
    assert any(n.id == node.id for n in pruned)


# ---------------------------------------------------------------------
# store.py — distill / daily notes
# ---------------------------------------------------------------------


def test_distill_missing_daily_note_raises(store: AmpStore):
    with pytest.raises(NodeNotFoundError):
        store.distill(date="2099-12-31")


def test_create_daily_note_idempotent(store: AmpStore):
    path1 = store.create_daily_note(date="2026-05-01")
    text1 = path1.read_text(encoding="utf-8")
    path2 = store.create_daily_note(date="2026-05-01")
    text2 = path2.read_text(encoding="utf-8")
    assert path1 == path2
    assert text1 == text2


# ---------------------------------------------------------------------
# store.py — export
# ---------------------------------------------------------------------


def test_export_amp_format_returns_root(store: AmpStore):
    result = store.export(format="amp")
    assert result == store.root


def test_export_unknown_format_raises(store: AmpStore):
    with pytest.raises(AmpError):
        store.export(format="bogus")


def test_export_json_includes_daily_notes(store: AmpStore):
    store.create_daily_note(date="2026-05-02")
    data = store.export(format="json")
    assert any(d["filename"] == "2026-05-02.md" for d in data["daily"])


def test_export_json_no_daily_dir(store: AmpStore):
    import shutil

    shutil.rmtree(store.daily_dir)
    data = store.export(format="json")
    assert data["daily"] == []


def test_export_markdown_includes_tags(store: AmpStore):
    store.store("Tagged export fact", type="fact", tags=["one", "two"])
    text = store.export(format="markdown")
    assert "Tags: one, two" in text


def test_export_to_path_amp_new_and_overwrite(store: AmpStore, tmp_path: Path):
    store.store("Exportable", type="fact")
    dest = tmp_path / "export-dest"
    result1 = store.export_to_path(dest, format="amp")
    assert result1 == dest
    assert (dest / "amp.yaml").exists()

    # Second call: dest already exists, exercises the rmtree branch.
    result2 = store.export_to_path(dest, format="amp")
    assert result2 == dest
    assert (dest / "amp.yaml").exists()


def test_export_to_path_json(store: AmpStore, tmp_path: Path):
    store.store("JSON export", type="fact")
    dest = tmp_path / "export.json"
    result = store.export_to_path(dest, format="json")
    assert result == dest
    data = json.loads(dest.read_text(encoding="utf-8"))
    assert data["nodes"]


def test_export_to_path_markdown(store: AmpStore, tmp_path: Path):
    store.store("Markdown export", type="fact")
    dest = tmp_path / "export.md"
    result = store.export_to_path(dest, format="markdown")
    assert result == dest
    assert "Markdown export" in dest.read_text(encoding="utf-8")


def test_export_to_path_unknown_format_raises(store: AmpStore, tmp_path: Path):
    with pytest.raises(AmpError):
        store.export_to_path(tmp_path / "whatever", format="bogus")


# ---------------------------------------------------------------------
# store.py — import
# ---------------------------------------------------------------------


def test_import_skips_existing_without_overwrite(store: AmpStore, tmp_path: Path):
    existing = store.store("Existing node", type="fact", id="shared-id")
    payload = {
        "nodes": [
            {"id": "shared-id", "type": "fact", "content": "New content that should be skipped"},
        ]
    }
    src = tmp_path / "import.json"
    src.write_text(json.dumps(payload), encoding="utf-8")
    count = store.import_data(src, overwrite=False)
    assert count == 0
    fetched = store.show("shared-id")
    assert "New content that should be skipped" not in fetched.content


def test_import_overwrite_true_still_creates_when_no_conflict(store: AmpStore, tmp_path: Path):
    payload = {"nodes": [{"id": "fresh-import", "type": "fact", "content": "Fresh content"}]}
    src = tmp_path / "import.json"
    src.write_text(json.dumps(payload), encoding="utf-8")
    count = store.import_data(src, overwrite=True)
    assert count == 1


def test_import_daily_notes_skip_and_overwrite(store: AmpStore, tmp_path: Path):
    store.create_daily_note(date="2026-06-01")
    original_text = (store.daily_dir / "2026-06-01.md").read_text(encoding="utf-8")

    payload = {
        "nodes": [],
        "daily": [
            {"date": "2026-06-01", "filename": "2026-06-01.md", "status": "pending", "content": "Overwritten?"},
            {"date": "2026-06-02", "filename": "2026-06-02.md", "status": "pending", "content": "Brand new day"},
        ],
    }
    src = tmp_path / "import.json"
    src.write_text(json.dumps(payload), encoding="utf-8")

    store.import_data(src, overwrite=False)
    # Existing daily note untouched because overwrite=False.
    assert (store.daily_dir / "2026-06-01.md").read_text(encoding="utf-8") == original_text
    # New daily note created.
    assert (store.daily_dir / "2026-06-02.md").exists()

    store.import_data(src, overwrite=True)
    # Now it should have been overwritten.
    new_text = (store.daily_dir / "2026-06-01.md").read_text(encoding="utf-8")
    assert "Overwritten?" in new_text


# ---------------------------------------------------------------------
# store.py — validate
# ---------------------------------------------------------------------


def test_validate_manifest_parse_error(store: AmpStore):
    store.manifest_path.write_text("key: [unterminated\n", encoding="utf-8")
    issues = store.validate()
    assert len(issues) == 1
    assert "Could not parse amp.yaml" in issues[0].message


def test_validate_version_mismatch_warning(store: AmpStore):
    manifest = store.load_manifest()
    manifest["amp"] = "9.9"
    store.save_manifest(manifest)
    issues = store.validate()
    assert any("differs from supported" in i.message for i in issues)


def test_validate_missing_top_level_key(store: AmpStore):
    manifest = store.load_manifest()
    del manifest["settings"]
    store.save_manifest(manifest)
    issues = store.validate()
    assert any("missing top-level key 'settings'" in i.message for i in issues)


def test_validate_missing_required_field(store: AmpStore):
    write_raw_node(
        store,
        "facts",
        "no-created-field.md",
        {
            "id": "no-created-field",
            "type": "fact",
            "modified": "2026-01-01T00:00:00Z",
            "author": "agent:tester",
            "status": "active",
        },
    )
    issues = store.validate()
    assert any("Missing required field 'created'" in i.message for i in issues)


def test_validate_invalid_type_status_scope_and_dir_mismatch(store: AmpStore):
    write_raw_node(
        store,
        "episodes",  # wrong dir on purpose: type resolves to facts bucket
        "weird-node.md",
        {
            "id": "weird-node-id",
            "type": "not-a-type",
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z",
            "author": "agent:tester",
            "status": "not-a-status",
            "scope": "not-a-scope",
        },
    )
    issues = store.validate()
    messages = [i.message for i in issues]
    assert any("Invalid type 'not-a-type'" in m for m in messages)
    assert any("Invalid status 'not-a-status'" in m for m in messages)
    assert any("Invalid scope 'not-a-scope'" in m for m in messages)
    assert any("located in 'episodes/'" in m for m in messages)
    assert any("Filename 'weird-node.md' does not match id" in m for m in messages)


def test_validate_episode_filename_missing_prefix_but_stem_matches_id(store: AmpStore):
    # Filename doesn't match the canonical date-prefixed pattern, and doesn't end
    # with "-<id>.md" either, but the bare stem equals the id exactly -- this
    # should NOT produce a "filename does not match id" warning.
    write_raw_node(
        store,
        "episodes",
        "my-episode.md",
        {
            "id": "my-episode",
            "type": "episode",
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z",
            "author": "agent:tester",
            "status": "active",
        },
    )
    issues = store.validate()
    assert not any("does not match id" in i.message for i in issues)


def test_validate_duplicate_id(store: AmpStore):
    write_raw_node(
        store,
        "facts",
        "dup-a.md",
        {
            "id": "dup-id",
            "type": "fact",
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z",
            "author": "agent:tester",
            "status": "active",
        },
    )
    write_raw_node(
        store,
        "facts",
        "dup-b.md",
        {
            "id": "dup-id",
            "type": "fact",
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z",
            "author": "agent:tester",
            "status": "active",
        },
    )
    issues = store.validate()
    assert any("Duplicate id" in i.message for i in issues)


def test_validate_link_relation_and_target_issues(store: AmpStore):
    store.store(
        "Has a bad link",
        type="fact",
        links=[{"target": "missing-target", "relation": "bogus-relation"}],
    )
    issues = store.validate()
    messages = [i.message for i in issues]
    assert any("Unknown link relation" in m for m in messages)
    assert any("Link target 'missing-target' does not exist" in m for m in messages)


def test_validate_multiple_wikilinks_to_missing_targets(store: AmpStore):
    store.store("References [[missing-a]] and also [[missing-b]] here", type="fact")
    issues = store.validate()
    messages = [i.message for i in issues]
    assert any("missing-a" in m for m in messages)
    assert any("missing-b" in m for m in messages)


def test_validate_superseded_without_superseded_by(store: AmpStore):
    n = store.store("Will become superseded manually", type="fact")
    store.update(n.id, status="superseded")
    issues = store.validate()
    assert any("superseded_by" in i.message and i.node_id == n.id for i in issues)


def test_validate_clean_store_returns_no_issues_message(store: AmpStore):
    issues = store.validate()
    assert issues == []


def test_validation_issue_to_dict_and_repr():
    issue = ValidationIssue("warning", "Something is off", node_id="node-1")
    assert issue.to_dict() == {"level": "warning", "message": "Something is off", "node_id": "node-1"}
    assert repr(issue) == "WARNING: [node-1] Something is off"

    issue_no_node = ValidationIssue("error", "General problem")
    assert repr(issue_no_node) == "ERROR: General problem"


# ---------------------------------------------------------------------
# store.py — stats
# ---------------------------------------------------------------------


def test_stats_empty_store(store: AmpStore):
    data = store.stats()
    assert data["total_nodes"] == 0
    assert data["by_type"] == {}
    assert data["by_status"] == {}
    assert data["by_scope"] == {}
    assert data["top_tags"] == []
    assert data["average_confidence"] is None
    assert data["oldest_node"] is None
    assert data["newest_node"] is None


def test_stats_node_without_scope(store: AmpStore, tmp_path: Path):
    payload = {"nodes": [{"id": "no-scope-node", "type": "fact", "content": "No scope here"}]}
    src = tmp_path / "import.json"
    src.write_text(json.dumps(payload), encoding="utf-8")
    store.import_data(src)
    data = store.stats()
    assert data["by_scope"] == {}


def test_stats_no_daily_dir(store: AmpStore):
    import shutil

    shutil.rmtree(store.daily_dir)
    data = store.stats()
    assert data["daily_notes"] == 0


# ---------------------------------------------------------------------
# store.py — ValidationIssue direct construction already covered above.
# ---------------------------------------------------------------------


def test_node_exists_error_importable():
    # Sanity check the symbol is exported and instantiable.
    err = NodeExistsError("dup")
    assert str(err) == "dup"


# =======================================================================
# CLI tests
# =======================================================================


def _init_cli_store(runner: CliRunner, name: str = "CLI Store", agent_id: str = "cli-agent"):
    return runner.invoke(main, ["init", "--name", name, "--agent-id", agent_id])


def test_cli_dunder_main_entrypoint(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["amp", "--help"])
    with pytest.raises(SystemExit) as exc_info:
        runpy.run_module("amp.cli", run_name="__main__")
    assert exc_info.value.code == 0


def test_cli_init_already_exists_without_force(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        result = _init_cli_store(runner)
        assert result.exit_code == 0
        result2 = _init_cli_store(runner)
        assert result2.exit_code != 0
        assert "already exists" in result2.output or "Error" in result2.output


def test_cli_init_force_reinitializes(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(
            main, ["init", "--name", "Reinit", "--agent-id", "agent2", "--force"]
        )
        assert result.exit_code == 0
        assert "Reinit" in result.output


def test_cli_store_with_path_option(tmp_path: Path):
    runner = CliRunner()
    store_dir = tmp_path / "mystore" / ".amp"
    result = runner.invoke(main, ["--path", str(store_dir), "init", "--name", "PathStore"])
    assert result.exit_code == 0

    result2 = runner.invoke(main, ["--path", str(store_dir), "store", "A fact stored via path"])
    assert result2.exit_code == 0

    result3 = runner.invoke(main, ["--path", str(store_dir), "list"])
    assert result3.exit_code == 0


def test_cli_path_option_store_not_found(tmp_path: Path):
    runner = CliRunner()
    missing_dir = tmp_path / "does-not-exist" / ".amp"
    result = runner.invoke(main, ["--path", str(missing_dir), "list"])
    assert result.exit_code != 0
    assert "Error" in result.output


def test_cli_no_store_discovered(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        result = runner.invoke(main, ["list"])
        assert result.exit_code != 0
        assert "Error" in result.output


def test_cli_show_full_node(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["store", "A link target fact", "--id", "link-target"])
        assert result.exit_code == 0, result.output

        result = runner.invoke(
            main,
            [
                "store",
                "A detailed fact with everything",
                "--tags",
                "a,b",
                "--confidence",
                "0.75",
                "--source",
                "conversation:xyz",
                "--scope",
                "team",
                "--id",
                "detailed-fact",
            ],
        )
        assert result.exit_code == 0, result.output

        # Give the node a link and mark it superseded_by so `show` renders every
        # optional metadata row (source, confidence, scope, tags, superseded_by, links).
        s = AmpStore(Path(".amp"))
        node = s.show("detailed-fact")
        node.links = [Link(target="link-target", relation="relates_to")]
        node.superseded_by = "link-target"
        from amp.node import write_node

        write_node(s.nodes_dir, node, date=node.created)

        result3 = runner.invoke(main, ["show", "detailed-fact"])
        assert result3.exit_code == 0, result3.output
        assert "detailed-fact" in result3.output
        assert "link-target" in result3.output


def test_cli_show_minimal_node(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["store", "Just a plain fact", "--type", "fact"])
        assert result.exit_code == 0
        # Extract the id from stats/list rather than parsing rich output; use library instead.
        s = AmpStore(Path(".amp"))
        node = s.list()[0]
        result2 = runner.invoke(main, ["show", node.id])
        assert result2.exit_code == 0, result2.output


def test_cli_show_node_without_scope(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        payload = {"nodes": [{"id": "no-scope-show", "type": "fact", "content": "No scope on this one"}]}
        Path("import.json").write_text(json.dumps(payload), encoding="utf-8")
        result = runner.invoke(main, ["import", "import.json"])
        assert result.exit_code == 0, result.output

        result2 = runner.invoke(main, ["show", "no-scope-show"])
        assert result2.exit_code == 0, result2.output
        assert "no-scope-show" in result2.output


def test_cli_show_missing_node(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["show", "does-not-exist"])
        assert result.exit_code != 0


def test_cli_search_with_and_without_query(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Searchable python fact", "--tags", "python", "--type", "fact"])

        result = runner.invoke(main, ["search", "python"])
        assert result.exit_code == 0
        assert "python" in result.output.lower() or "fact" in result.output.lower()

        result2 = runner.invoke(main, ["search"])
        assert result2.exit_code == 0

        result3 = runner.invoke(
            main, ["search", "python", "--type", "fact", "--status", "active", "--tag", "python", "--since", "2020-01-01"]
        )
        assert result3.exit_code == 0

        result4 = runner.invoke(main, ["search", "no-such-term-anywhere"])
        assert result4.exit_code == 0
        assert "No matching" in result4.output


def test_cli_update_all_options(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Updatable fact", "--id", "updatable-fact", "--tags", "a,b"])

        result = runner.invoke(
            main,
            [
                "update",
                "updatable-fact",
                "--content",
                "New body content",
                "--tags",
                "x,y",
                "--add-tags",
                "z",
                "--remove-tags",
                "x",
                "--confidence",
                "0.4",
                "--status",
                "archived",
                "--scope",
                "team",
            ],
        )
        assert result.exit_code == 0, result.output
        assert "Updated" in result.output


def test_cli_update_missing_node(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["update", "nope", "--tags", "x"])
        assert result.exit_code != 0


def test_cli_archive(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Archive me", "--id", "archive-me"])
        result = runner.invoke(main, ["archive", "archive-me"])
        assert result.exit_code == 0
        assert "Archived" in result.output


def test_cli_archive_missing_node(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["archive", "nope"])
        assert result.exit_code != 0


def test_cli_merge(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Primary node", "--id", "primary-node", "--type", "fact"])
        runner.invoke(main, ["store", "Secondary node", "--id", "secondary-node", "--type", "fact"])
        result = runner.invoke(main, ["merge", "primary-node", "secondary-node"])
        assert result.exit_code == 0
        assert "Merged" in result.output


def test_cli_merge_missing_node(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["merge", "nope1", "nope2"])
        assert result.exit_code != 0


def test_cli_prune_nothing_to_do(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["prune"])
        assert result.exit_code == 0
        assert "Nothing to do" in result.output


def test_cli_prune_with_results_and_dry_run(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Low conf", "--id", "low-conf", "--confidence", "0.1"])

        result = runner.invoke(main, ["prune", "--low-confidence", "0.5", "--dry-run"])
        assert result.exit_code == 0
        assert "Would prune" in result.output

        result2 = runner.invoke(main, ["prune", "--low-confidence", "0.5"])
        assert result2.exit_code == 0
        assert "Pruned" in result2.output


def test_cli_prune_empty_results(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "High conf", "--confidence", "0.99"])
        result = runner.invoke(main, ["prune", "--low-confidence", "0.01"])
        assert result.exit_code == 0
        assert "Nothing to prune" in result.output


def test_cli_distill(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        s = AmpStore(Path(".amp"))
        s.create_daily_note(date="2026-07-01")
        result = runner.invoke(main, ["distill", "--date", "2026-07-01"])
        assert result.exit_code == 0
        assert "Distilled" in result.output


def test_cli_distill_missing_note(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["distill", "--date", "2099-01-01"])
        assert result.exit_code != 0


def test_cli_export_amp_requires_output(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["export", "--format", "amp"])
        assert result.exit_code != 0
        assert "--output is required" in result.output


def test_cli_export_amp_with_output(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Exportable"])
        result = runner.invoke(main, ["export", "--format", "amp", "--output", "exported-store"])
        assert result.exit_code == 0
        assert "Exported" in result.output
        assert Path("exported-store", "amp.yaml").exists()


def test_cli_export_json_to_stdout(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Exportable json"])
        result = runner.invoke(main, ["export", "--format", "json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["nodes"]


def test_cli_export_json_to_file(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Exportable json file"])
        result = runner.invoke(main, ["export", "--format", "json", "--output", "out.json"])
        assert result.exit_code == 0
        assert Path("out.json").exists()


def test_cli_export_markdown_to_stdout(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Exportable markdown"])
        result = runner.invoke(main, ["export", "--format", "markdown"])
        assert result.exit_code == 0
        assert "Exportable markdown" in result.output


def test_cli_export_markdown_to_file(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Exportable markdown file"])
        result = runner.invoke(main, ["export", "--format", "markdown", "--output", "out.md"])
        assert result.exit_code == 0
        assert Path("out.md").exists()


def test_cli_import_roundtrip(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Importable fact", "--id", "importable-fact"])
        runner.invoke(main, ["export", "--format", "json", "--output", "export.json"])

        result = runner.invoke(main, ["import", "export.json"])
        assert result.exit_code == 0
        assert "Imported" in result.output

        result2 = runner.invoke(main, ["import", "export.json", "--overwrite"])
        assert result2.exit_code == 0


def test_cli_validate_clean_store(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result = runner.invoke(main, ["validate"])
        assert result.exit_code == 0
        assert "valid" in result.output.lower()


def test_cli_validate_with_warnings_only(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "References [[missing-thing]] which is gone"])
        result = runner.invoke(main, ["validate"])
        assert result.exit_code == 0
        assert "issue" in result.output.lower()


def test_cli_validate_with_errors_exits_nonzero(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        s = AmpStore(Path(".amp"))
        write_raw_node(
            s,
            "facts",
            "bad-type-node.md",
            {
                "id": "bad-type-node",
                "type": "totally-invalid-type",
                "created": "2026-01-01T00:00:00Z",
                "modified": "2026-01-01T00:00:00Z",
                "author": "agent:tester",
                "status": "active",
            },
        )
        result = runner.invoke(main, ["validate"])
        assert result.exit_code == 1


def test_cli_stats_empty_and_populated(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result_empty = runner.invoke(main, ["stats"])
        assert result_empty.exit_code == 0

        runner.invoke(main, ["store", "Statsy fact", "--tags", "s1", "--confidence", "0.5"])
        result_populated = runner.invoke(main, ["stats"])
        assert result_populated.exit_code == 0
        assert "Statsy" in result_populated.output or "1" in result_populated.output


def test_cli_recall(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Python backend preference", "--tags", "python"])
        result = runner.invoke(main, ["recall", "python backend"])
        assert result.exit_code == 0


def test_cli_reindex(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        runner.invoke(main, ["store", "Reindex me"])
        result = runner.invoke(main, ["reindex"])
        assert result.exit_code == 0
        assert "Reindexed" in result.output


def test_cli_list_empty_and_long_preview(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        _init_cli_store(runner)
        result_empty = runner.invoke(main, ["list"])
        assert result_empty.exit_code == 0
        assert "No nodes found" in result_empty.output

        long_content = "This is a very long single line of content " * 5
        runner.invoke(main, ["store", long_content, "--type", "fact"])
        result = runner.invoke(main, ["list"])
        assert result.exit_code == 0
        assert "…" in result.output


# ---------------------------------------------------------------------
# commands/_common.py — direct unit tests
# ---------------------------------------------------------------------


def test_common_get_store_with_valid_path(store: AmpStore):
    from amp.commands._common import get_store

    result = get_store(str(store.root))
    assert result.root == store.root


def test_common_get_store_with_invalid_path_exits(tmp_path: Path):
    from amp.commands._common import get_store

    with pytest.raises(SystemExit):
        get_store(str(tmp_path / "nope" / ".amp"))


def test_common_get_store_discover_failure_exits(tmp_path: Path, monkeypatch):
    from amp.commands._common import get_store

    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit):
        get_store(None)


def test_common_fail_exits_with_code_1():
    from amp.commands._common import fail

    with pytest.raises(SystemExit) as exc_info:
        fail("boom")
    assert exc_info.value.code == 1


def test_common_handle_amp_errors_wraps_amperror():
    from amp.commands._common import handle_amp_errors

    @handle_amp_errors
    def raises_amp_error():
        raise AmpError("bad things happened")

    with pytest.raises(SystemExit) as exc_info:
        raises_amp_error()
    assert exc_info.value.code == 1


def test_common_handle_amp_errors_passthrough_on_success():
    from amp.commands._common import handle_amp_errors

    @handle_amp_errors
    def succeeds():
        return "ok"

    assert succeeds() == "ok"


def test_common_snippet_truncates_long_content():
    from amp.commands._common import snippet

    long_text = "word " * 40
    result = snippet(long_text, width=20)
    assert len(result) <= 20
    assert result.endswith("…")


def test_common_snippet_short_content_unchanged():
    from amp.commands._common import snippet

    assert snippet("short text") == "short text"


def test_common_print_node_table_empty(capsys):
    from amp.commands._common import print_node_table

    print_node_table([], title="Empty", empty_message="Nothing here.")
    captured = capsys.readouterr()
    assert "Nothing here." in captured.out
