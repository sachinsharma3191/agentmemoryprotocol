from __future__ import annotations

import click

from ..types import NODE_TYPES, STATUS_VALUES
from ._common import get_store, handle_amp_errors, print_node_table


@click.command()
@click.option("--type", "node_type", type=click.Choice(NODE_TYPES), default=None, help="Filter by node type.")
@click.option("--status", type=click.Choice(STATUS_VALUES), default=None, help="Filter by status.")
@click.option("--tag", default=None, help="Filter by tag.")
@click.pass_context
@handle_amp_errors
def list_cmd(ctx: click.Context, node_type: str | None, status: str | None, tag: str | None) -> None:
    """List memory nodes, optionally filtered."""
    store = get_store(ctx.obj.get("path"))
    nodes = store.list(type=node_type, status=status, tag=tag)
    print_node_table(nodes, title="Nodes")
