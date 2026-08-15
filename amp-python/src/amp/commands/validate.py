from __future__ import annotations

import click
from rich.table import Table

from ._common import console, get_store, handle_amp_errors


@click.command()
@click.pass_context
@handle_amp_errors
def validate_cmd(ctx: click.Context) -> None:
    """Check the store for integrity issues."""
    store = get_store(ctx.obj.get("path"))
    issues = store.validate()

    if not issues:
        console.print("[bold green]Store is valid.[/bold green] No issues found.")
        return

    table = Table(title=f"Validation: {len(issues)} issue(s)", header_style="bold")
    table.add_column("Level")
    table.add_column("Node")
    table.add_column("Message")
    for issue in issues:
        level_color = "red" if issue.level == "error" else "yellow"
        table.add_row(f"[{level_color}]{issue.level}[/{level_color}]", issue.node_id or "-", issue.message)
    console.print(table)

    error_count = sum(1 for i in issues if i.level == "error")
    if error_count:
        raise SystemExit(1)
