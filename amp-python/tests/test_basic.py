"""Basic tests covering the amp library API and CLI."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from amp import AmpStore, NodeNotFoundError, StoreNotFoundError
from amp.cli import main


@pytest.fixture()
def store(tmp_path: Path) -> AmpStore:
    s = AmpStore(tmp_path / ".amp")
    s.init(name="Test Memory", agent_id="tester")
    return s


# ---------------------------------------------------------------------
# Library API
# ---------------------------------------------------------------------


def test_init_creates_structure(tmp_path: Path):
    s = AmpStore(tmp_path / ".amp")
    manifest = s.init(name="My Memory", agent_id="my-agent")

    assert s.exists()
    assert manifest["store"]["name"] == "My Memory"
    assert manifest["agent"]["id"] == "my-agent"
    for sub in ("facts", "episodes", "preferences", "procedures", "reflections"):
        assert (s.nodes_dir / sub).is_dir()
    assert s.daily_dir.is_dir()
    assert (s.index_dir / "keywords.json").exists()
    assert (s.index_dir / "graph.json").exists()
    assert s.changelog_path.exists()


def test_store_not_found_without_init(tmp_path: Path):
    s = AmpStore(tmp_path / ".amp")
    with pytest.raises(StoreNotFoundError):
        s.store("hello world")


def test_store_and_show(store: AmpStore):
    node = store.store("User prefers Python for backend work", tags=["python"])
    assert node.type == "preference"  # auto-classified via "prefers"
    assert node.id.startswith("user") or "python" in node.id

    fetched = store.show(node.id)
    assert fetched.id == node.id
    assert "Python" in fetched.content


def test_store_auto_classification():
    cases = {
        "User prefers dark mode": "preference",
        "How to deploy the service: steps below": "procedure",
        "Always run tests before merging, never skip CI": "reflection",
        "We deployed the new API yesterday": "episode",
        "The service runs on port 8080": "fact",
    }
    for content, expected in cases.items():
        assert AmpStore.classify(content) == expected


def test_store_unique_ids(store: AmpStore):
    n1 = store.store("Python is great", type="fact")
    n2 = store.store("Python is great", type="fact")
    assert n1.id != n2.id


def test_show_missing_raises(store: AmpStore):
    with pytest.raises(NodeNotFoundError):
        store.show("does-not-exist")


def test_list_filters(store: AmpStore):
    store.store("Fact one", type="fact", tags=["a"])
    store.store("Preference one", type="preference", tags=["b"])
    store.store("Fact two", type="fact", tags=["a", "c"])

    assert len(store.list(type="fact")) == 2
    assert len(store.list(type="preference")) == 1
    assert len(store.list(tag="a")) == 2
    assert len(store.list(tag="c")) == 1


def test_search_query_and_filters(store: AmpStore):
    store.store("Python is the preferred backend language", type="preference", tags=["python"])
    store.store("The deploy pipeline uses Docker", type="fact", tags=["deploy"])

    results = store.search("python")
    assert len(results) == 1
    assert results[0].tags == ["python"]

    results = store.search("", type="fact")
    assert len(results) == 1

    results = store.search("nonexistenttoken")
    assert results == []


def test_recall_keyword_matching(store: AmpStore):
    store.store("User prefers Python for backend services", tags=["python", "backend"])
    store.store("The office coffee machine is broken", tags=["office"])

    results = store.recall("what does the user like for backend python work")
    assert results
    assert results[0].tags == ["python", "backend"]


def test_update_node(store: AmpStore):
    node = store.store("Initial content", type="fact", tags=["x"])
    updated = store.update(node.id, content="New content here", add_tags=["y"], confidence=0.7)
    assert "New content here" in updated.content
    assert set(updated.tags) == {"x", "y"}
    assert updated.confidence == 0.7
    assert updated.modified >= node.modified


def test_archive_node(store: AmpStore):
    node = store.store("Something to archive", type="fact")
    archived = store.archive(node.id)
    assert archived.status == "archived"


def test_merge_nodes(store: AmpStore):
    n1 = store.store("Primary fact about the system", type="fact", tags=["a"])
    n2 = store.store("Secondary fact about the system", type="fact", tags=["b"])

    merged = store.merge(n1.id, n2.id)
    assert merged.id == n1.id
    assert "a" in merged.tags and "b" in merged.tags
    assert "Secondary fact" in merged.content

    secondary = store.show(n2.id)
    assert secondary.status == "superseded"
    assert secondary.superseded_by == n1.id


def test_prune_stale_and_low_confidence(store: AmpStore):
    keep = store.store("Keep me around", type="fact", confidence=0.9)
    drop = store.store("Low confidence note", type="fact", confidence=0.1)

    candidates = store.prune(low_confidence=0.5, dry_run=True)
    assert any(n.id == drop.id for n in candidates)
    assert all(n.id != keep.id for n in candidates)
    # dry run shouldn't delete anything
    assert store.show(drop.id) is not None

    pruned = store.prune(low_confidence=0.5, dry_run=False)
    assert any(n.id == drop.id for n in pruned)
    with pytest.raises(NodeNotFoundError):
        store.show(drop.id)
    assert store.show(keep.id) is not None


def test_distill_daily_note(store: AmpStore):
    path = store.create_daily_note(date="2026-04-18")
    assert path.exists()
    result = store.distill(date="2026-04-18")
    assert result["status"] == "distilled"

    import frontmatter as fm

    post = fm.load(str(path))
    assert post.metadata["status"] == "distilled"


def test_reindex_builds_keywords_and_graph(store: AmpStore):
    a = store.store("Deploy pipeline notes", type="fact", tags=["deploy"])
    store.store(f"See [[{a.id}]] for details on deploys", type="fact")

    keywords, graph = store.reindex()
    assert a.id in keywords
    assert a.id in graph["incoming"]
    assert len(graph["incoming"][a.id]) == 1


def test_export_json_and_import_roundtrip(store: AmpStore, tmp_path: Path):
    store.store("Exportable fact", type="fact", tags=["x"])
    data = store.export(format="json")
    assert data["nodes"]
    assert data["manifest"]["store"]["name"] == "Test Memory"

    export_path = tmp_path / "export.json"
    export_path.write_text(json.dumps(data), encoding="utf-8")

    new_store = AmpStore(tmp_path / ".amp2")
    new_store.init(name="Imported", agent_id="importer")
    count = new_store.import_data(export_path)
    assert count == 1
    assert len(new_store.list()) == 1


def test_export_markdown(store: AmpStore):
    store.store("Markdown export fact", type="fact")
    text = store.export(format="markdown")
    assert "Markdown export fact" in text


def test_validate_clean_store(store: AmpStore):
    store.store("A valid fact", type="fact")
    issues = store.validate()
    errors = [i for i in issues if i.level == "error"]
    assert errors == []


def test_validate_detects_bad_link(store: AmpStore):
    store.store("References [[missing-node]] which does not exist", type="fact")
    issues = store.validate()
    assert any("missing-node" in i.message for i in issues)


def test_stats(store: AmpStore):
    store.store("Fact one", type="fact", confidence=0.8, tags=["x"])
    store.store("Pref one", type="preference", confidence=0.6, tags=["x", "y"])

    data = store.stats()
    assert data["total_nodes"] == 2
    assert data["by_type"]["fact"] == 1
    assert data["by_type"]["preference"] == 1
    assert data["top_tags"][0][0] == "x"
    assert 0.6 <= data["average_confidence"] <= 0.8


# ---------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------


def test_cli_help_lists_commands():
    runner = CliRunner()
    result = runner.invoke(main, ["--help"])
    assert result.exit_code == 0
    for cmd in (
        "init", "store", "recall", "search", "list", "show", "update",
        "archive", "merge", "prune", "distill", "reindex", "export",
        "import", "validate", "stats",
    ):
        assert cmd in result.output


def test_cli_full_workflow(tmp_path: Path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        result = runner.invoke(main, ["init", "--name", "CLI Store", "--agent-id", "cli-agent"])
        assert result.exit_code == 0, result.output

        result = runner.invoke(
            main,
            ["store", "User prefers dark mode in the editor", "--tags", "ui,preference"],
        )
        assert result.exit_code == 0, result.output

        result = runner.invoke(main, ["list"])
        assert result.exit_code == 0
        assert "dark" in result.output.lower() or "preference" in result.output.lower()

        result = runner.invoke(main, ["recall", "editor theme preference"])
        assert result.exit_code == 0

        result = runner.invoke(main, ["validate"])
        assert result.exit_code == 0

        result = runner.invoke(main, ["stats"])
        assert result.exit_code == 0

        result = runner.invoke(main, ["reindex"])
        assert result.exit_code == 0
