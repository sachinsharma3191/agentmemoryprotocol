from __future__ import annotations

import click

from ._common import console, get_store, handle_amp_errors


@click.command()
@click.argument("id1")
@click.argument("id2")
@click.pass_context
@handle_amp_errors
def merge_cmd(ctx: click.Context, id1: str, id2: str) -> None:
    """Merge ID2 into ID1. ID2 is marked superseded_by ID1."""
    store = get_store(ctx.obj.get("path"))
    node = store.merge(id1, id2)
    console.print(f"[green]Merged[/green] {id2} into {node.id}")
