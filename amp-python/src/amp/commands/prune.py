from __future__ import annotations

import click

from ._common import console, get_store, handle_amp_errors, print_node_table


@click.command()
@click.option("--stale-days", type=int, default=None, help="Prune active nodes not modified in N days.")
@click.option("--low-confidence", type=float, default=None, help="Prune nodes with confidence below this value.")
@click.option("--dry-run", is_flag=True, help="Show what would be pruned without deleting anything.")
@click.pass_context
@handle_amp_errors
def prune_cmd(ctx: click.Context, stale_days: int | None, low_confidence: float | None, dry_run: bool) -> None:
    """Remove stale or low-confidence nodes."""
    if stale_days is None and low_confidence is None:
        console.print("[dim]Nothing to do: pass --stale-days and/or --low-confidence.[/dim]")
        return

    store = get_store(ctx.obj.get("path"))
    nodes = store.prune(stale_days=stale_days, low_confidence=low_confidence, dry_run=dry_run)
    verb = "Would prune" if dry_run else "Pruned"
    print_node_table(nodes, title=f"{verb} {len(nodes)} node(s)", empty_message="Nothing to prune.")
