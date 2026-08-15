from __future__ import annotations

import click

from ..types import NODE_TYPES, STATUS_VALUES
from ._common import get_store, handle_amp_errors, print_node_table


@click.command()
@click.argument("query", default="")
@click.option("--type", "node_type", type=click.Choice(NODE_TYPES), default=None, help="Filter by node type.")
@click.option("--status", type=click.Choice(STATUS_VALUES), default=None, help="Filter by status.")
@click.option("--tag", default=None, help="Filter by tag.")
@click.option("--since", default=None, help="Only nodes modified on/after this date (YYYY-MM-DD).")
@click.pass_context
@handle_amp_errors
def search_cmd(
    ctx: click.Context,
    query: str,
    node_type: str | None,
    status: str | None,
    tag: str | None,
    since: str | None,
) -> None:
    """Search nodes by QUERY text, with optional filters."""
    store = get_store(ctx.obj.get("path"))
    nodes = store.search(query, type=node_type, status=status, tag=tag, since=since)
    title = f"Search: {query!r}" if query else "Search: (all nodes)"
    print_node_table(nodes, title=title, empty_message="No matching nodes found.")
