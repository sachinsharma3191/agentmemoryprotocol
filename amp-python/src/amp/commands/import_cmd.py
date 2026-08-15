from __future__ import annotations

import click

from ._common import console, get_store, handle_amp_errors


@click.command()
@click.argument("source")
@click.option("--overwrite", is_flag=True, help="Overwrite existing nodes/daily notes with the same id.")
@click.pass_context
@handle_amp_errors
def import_cmd(ctx: click.Context, source: str, overwrite: bool) -> None:
    """Import nodes from a JSON export produced by `amp export --format json`."""
    store = get_store(ctx.obj.get("path"))
    count = store.import_data(source, overwrite=overwrite)
    console.print(f"[green]Imported[/green] {count} node(s) from {source}")
