from __future__ import annotations

import click
from rich.panel import Panel
from rich.table import Table

from ._common import console, get_store, handle_amp_errors


@click.command()
@click.pass_context
@handle_amp_errors
def stats_cmd(ctx: click.Context) -> None:
    """Show summary statistics for the store."""
    store = get_store(ctx.obj.get("path"))
    data = store.stats()

    avg_conf = (
        f"{data['average_confidence']:.2f}" if data["average_confidence"] is not None else "n/a"
    )
    header = (
        f"[bold]{data['store_name']}[/bold] (agent: {data['agent_id']})\n"
        f"Total nodes: {data['total_nodes']}   Daily notes: {data['daily_notes']}\n"
        f"Average confidence: {avg_conf}"
    )
    console.print(Panel(header, title="Store Stats", border_style="cyan"))

    def _counts_table(title: str, counts: dict) -> Table:
        table = Table(title=title, header_style="bold")
        table.add_column("Key")
        table.add_column("Count", justify="right")
        for key, value in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
            table.add_row(str(key), str(value))
        return table

    if data["by_type"]:
        console.print(_counts_table("By type", data["by_type"]))
    if data["by_status"]:
        console.print(_counts_table("By status", data["by_status"]))
    if data["by_scope"]:
        console.print(_counts_table("By scope", data["by_scope"]))
    if data["top_tags"]:
        console.print(_counts_table("Top tags", dict(data["top_tags"])))

    console.print(f"Oldest node: {data['oldest_node'] or '-'}")
    console.print(f"Newest node: {data['newest_node'] or '-'}")
