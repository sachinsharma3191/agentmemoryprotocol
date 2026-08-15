from __future__ import annotations

import json

import click

from ._common import console, err_console, get_store, handle_amp_errors


@click.command()
@click.option("--format", "fmt", type=click.Choice(["amp", "json", "markdown"]), default="json",
              show_default=True, help="Export format.")
@click.option("--output", "-o", "output", default=None,
              help="Destination path. Required for 'amp' format; printed to stdout otherwise if omitted.")
@click.pass_context
@handle_amp_errors
def export_cmd(ctx: click.Context, fmt: str, output: str | None) -> None:
    """Export the store as a full copy, JSON, or Markdown."""
    store = get_store(ctx.obj.get("path"))

    if fmt == "amp":
        if not output:
            err_console.print("[bold red]Error:[/bold red] --output is required for --format amp")
            raise SystemExit(1)
        dest = store.export_to_path(output, format="amp")
        console.print(f"[green]Exported[/green] full store to {dest}")
        return

    if output:
        dest = store.export_to_path(output, format=fmt)
        console.print(f"[green]Exported[/green] ({fmt}) to {dest}")
        return

    data = store.export(format=fmt)
    if fmt == "json":
        click.echo(json.dumps(data, indent=2, sort_keys=True))
    else:
        click.echo(data)
