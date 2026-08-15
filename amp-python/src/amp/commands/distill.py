from __future__ import annotations

import click

from ._common import console, get_store, handle_amp_errors


@click.command()
@click.option("--date", default=None, help="Date of the daily note to distill (YYYY-MM-DD, default: today).")
@click.pass_context
@handle_amp_errors
def distill_cmd(ctx: click.Context, date: str | None) -> None:
    """Process a daily note, marking it as distilled."""
    store = get_store(ctx.obj.get("path"))
    result = store.distill(date=date)
    console.print(f"[green]Distilled[/green] daily note {result['date']} -> status={result['status']}")
