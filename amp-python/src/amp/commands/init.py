from __future__ import annotations

import click
from rich.panel import Panel

from ..store import AmpStore, StoreExistsError
from ._common import console, err_console


@click.command()
@click.option("--name", default="AMP Memory", show_default=True, help="Human-readable store name.")
@click.option("--agent-id", default="assistant", show_default=True, help="Identifier for the owning agent.")
@click.option("--agent-name", default=None, help="Human-readable agent name (defaults to agent id).")
@click.option("--description", default="", help="Short description of the agent.")
@click.option("--default-scope", default="agent", show_default=True,
              type=click.Choice(["agent", "user", "team", "workspace", "public"]),
              help="Default scope assigned to new nodes.")
@click.option("--force", is_flag=True, help="Reinitialize even if a store already exists.")
@click.pass_context
def init_cmd(
    ctx: click.Context,
    name: str,
    agent_id: str,
    agent_name: str | None,
    description: str,
    default_scope: str,
    force: bool,
) -> None:
    """Create a new AMP store (amp.yaml + directory structure) in ./.amp."""
    path = ctx.obj.get("path") or ".amp"
    store = AmpStore(path)
    try:
        manifest = store.init(
            name=name,
            agent_id=agent_id,
            agent_name=agent_name,
            description=description,
            default_scope=default_scope,
            force=force,
        )
    except StoreExistsError as exc:
        err_console.print(f"[bold red]Error:[/bold red] {exc} (use --force to reinitialize)")
        raise SystemExit(1)

    body = (
        f"[bold]Store:[/bold] {manifest['store']['name']} ({manifest['store']['id']})\n"
        f"[bold]Agent:[/bold] {manifest['agent']['name']} ({manifest['agent']['id']})\n"
        f"[bold]Path:[/bold]  {store.root.resolve()}\n"
        f"[bold]Scope:[/bold] {manifest['settings']['default_scope']}"
    )
    console.print(Panel(body, title="AMP store initialized", border_style="green"))
