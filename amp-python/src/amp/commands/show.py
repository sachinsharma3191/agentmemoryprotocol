from __future__ import annotations

import click
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

from ._common import console, get_store, handle_amp_errors, status_badge, type_badge


@click.command()
@click.argument("node_id")
@click.pass_context
@handle_amp_errors
def show_cmd(ctx: click.Context, node_id: str) -> None:
    """Display a node's full content and metadata."""
    store = get_store(ctx.obj.get("path"))
    node = store.show(node_id)

    meta = Table.grid(padding=(0, 2))
    meta.add_column(style="bold")
    meta.add_column()
    meta.add_row("id", node.id)
    meta.add_row("type", type_badge(node.type))
    meta.add_row("status", status_badge(node.status))
    meta.add_row("author", node.author)
    meta.add_row("created", node.created)
    meta.add_row("modified", node.modified)
    if node.source:
        meta.add_row("source", node.source)
    if node.confidence is not None:
        meta.add_row("confidence", str(node.confidence))
    if node.scope:
        meta.add_row("scope", node.scope)
    if node.tags:
        meta.add_row("tags", ", ".join(node.tags))
    if node.superseded_by:
        meta.add_row("superseded_by", node.superseded_by)
    if node.links:
        meta.add_row("links", ", ".join(f"{l.target} ({l.relation})" for l in node.links))
    meta.add_row("path", node.path or "-")

    console.print(Panel(meta, title=f"[bold]{node.id}[/bold]", border_style="cyan"))
    console.print(Markdown(node.content))
