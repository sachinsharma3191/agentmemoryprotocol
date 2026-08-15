from __future__ import annotations

import click

from ._common import console, get_store, handle_amp_errors


@click.command()
@click.argument("node_id")
@click.pass_context
@handle_amp_errors
def archive_cmd(ctx: click.Context, node_id: str) -> None:
    """Set a node's status to archived."""
    store = get_store(ctx.obj.get("path"))
    node = store.archive(node_id)
    console.print(f"[yellow]Archived[/yellow] {node.id}")
