from __future__ import annotations

import click

from ._common import console, get_store, handle_amp_errors


@click.command()
@click.pass_context
@handle_amp_errors
def reindex_cmd(ctx: click.Context) -> None:
    """Rebuild index/keywords.json and index/graph.json."""
    store = get_store(ctx.obj.get("path"))
    keywords, graph = store.reindex()
    console.print(
        f"[green]Reindexed[/green] {len(keywords)} node(s) — "
        f"{sum(len(v) for v in graph['outgoing'].values())} outgoing link(s)."
    )
