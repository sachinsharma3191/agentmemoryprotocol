from __future__ import annotations

import click

from ._common import get_store, handle_amp_errors, print_node_table


@click.command()
@click.argument("context")
@click.option("--limit", type=int, default=10, show_default=True, help="Maximum number of results.")
@click.pass_context
@handle_amp_errors
def recall_cmd(ctx: click.Context, context: str, limit: int) -> None:
    """Retrieve nodes relevant to CONTEXT using keyword matching."""
    store = get_store(ctx.obj.get("path"))
    nodes = store.recall(context, limit=limit)
    print_node_table(nodes, title=f"Recall: {context!r}", empty_message="No relevant memories found.")
