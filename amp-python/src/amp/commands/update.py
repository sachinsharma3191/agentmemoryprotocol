from __future__ import annotations

import click

from ..types import STATUS_VALUES
from ._common import console, get_store, handle_amp_errors


@click.command()
@click.argument("node_id")
@click.option("--content", default=None, help="Replace the node's body content.")
@click.option("--tags", default=None, help="Replace tags (comma-separated).")
@click.option("--add-tags", default=None, help="Add tags (comma-separated).")
@click.option("--remove-tags", default=None, help="Remove tags (comma-separated).")
@click.option("--confidence", type=float, default=None, help="Update confidence score.")
@click.option("--status", type=click.Choice(STATUS_VALUES), default=None, help="Update status.")
@click.option("--scope", type=click.Choice(["agent", "user", "team", "workspace", "public"]),
              default=None, help="Update scope.")
@click.pass_context
@handle_amp_errors
def update_cmd(
    ctx: click.Context,
    node_id: str,
    content: str | None,
    tags: str | None,
    add_tags: str | None,
    remove_tags: str | None,
    confidence: float | None,
    status: str | None,
    scope: str | None,
) -> None:
    """Modify an existing node."""
    store = get_store(ctx.obj.get("path"))
    node = store.update(
        node_id,
        content=content,
        tags=[t.strip() for t in tags.split(",")] if tags else None,
        add_tags=[t.strip() for t in add_tags.split(",")] if add_tags else None,
        remove_tags=[t.strip() for t in remove_tags.split(",")] if remove_tags else None,
        confidence=confidence,
        status=status,
        scope=scope,
    )
    console.print(f"[green]Updated[/green] {node.id} (modified {node.modified})")
