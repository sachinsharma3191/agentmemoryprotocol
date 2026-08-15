from __future__ import annotations

import click
from rich.panel import Panel

from ..types import NODE_TYPES
from ._common import console, get_store, handle_amp_errors, type_badge


@click.command()
@click.argument("content")
@click.option("--type", "node_type", type=click.Choice(NODE_TYPES), default=None,
              help="Node type. Auto-classified from content if omitted.")
@click.option("--tags", default=None, help="Comma-separated list of tags.")
@click.option("--confidence", type=float, default=None, help="Confidence score between 0 and 1.")
@click.option("--source", default=None, help="Provenance, e.g. conversation:abc123.")
@click.option("--scope", type=click.Choice(["agent", "user", "team", "workspace", "public"]),
              default=None, help="Visibility scope. Defaults to the store's default scope.")
@click.option("--id", "node_id", default=None, help="Explicit node id (slug). Auto-generated if omitted.")
@click.pass_context
@handle_amp_errors
def store_cmd(
    ctx: click.Context,
    content: str,
    node_type: str | None,
    tags: str | None,
    confidence: float | None,
    source: str | None,
    scope: str | None,
    node_id: str | None,
) -> None:
    """Store CONTENT as a new memory node."""
    store = get_store(ctx.obj.get("path"))
    tag_list = [t.strip() for t in tags.split(",")] if tags else []
    node = store.store(
        content,
        type=node_type,
        tags=tag_list,
        confidence=confidence,
        source=source,
        scope=scope,
        id=node_id,
    )
    body = (
        f"[bold]id:[/bold] {node.id}\n"
        f"[bold]type:[/bold] {type_badge(node.type)}\n"
        f"[bold]tags:[/bold] {', '.join(node.tags) or '-'}\n"
        f"[bold]confidence:[/bold] {node.confidence if node.confidence is not None else '-'}\n"
        f"[bold]path:[/bold] {node.path}"
    )
    console.print(Panel(body, title="Memory stored", border_style="green"))
