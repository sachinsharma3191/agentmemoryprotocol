"""Shared helpers for CLI command implementations."""

from __future__ import annotations

import sys
from typing import Optional

import click
from rich.console import Console
from rich.table import Table

from ..store import AmpError, AmpStore, StoreNotFoundError

console = Console()
err_console = Console(stderr=True)


def get_store(path: Optional[str] = None) -> AmpStore:
    try:
        if path:
            store = AmpStore(path)
            if not store.exists():
                raise StoreNotFoundError(f"No AMP store found at {path}")
            return store
        return AmpStore.discover(".")
    except StoreNotFoundError as exc:
        err_console.print(f"[bold red]Error:[/bold red] {exc}")
        sys.exit(1)


def fail(message: str) -> None:
    err_console.print(f"[bold red]Error:[/bold red] {message}")
    sys.exit(1)


def handle_amp_errors(func):
    """Decorator that prints AmpError nicely and exits 1 instead of a traceback."""

    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except AmpError as exc:
            fail(str(exc))

    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    return wrapper


STATUS_COLORS = {
    "active": "green",
    "archived": "yellow",
    "superseded": "magenta",
    "disputed": "red",
    "redacted": "dim",
}

TYPE_COLORS = {
    "fact": "cyan",
    "preference": "blue",
    "episode": "green",
    "procedure": "yellow",
    "reflection": "magenta",
    "relation": "white",
}


def status_badge(status: str) -> str:
    color = STATUS_COLORS.get(status, "white")
    return f"[{color}]{status}[/{color}]"


def type_badge(node_type: str) -> str:
    color = TYPE_COLORS.get(node_type, "white")
    return f"[{color}]{node_type}[/{color}]"


def snippet(content: str, width: int = 60) -> str:
    lines = [ln.strip() for ln in content.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    text = " ".join(lines)
    if len(text) > width:
        text = text[: width - 1].rstrip() + "…"
    return text


def print_node_table(nodes, title: str, empty_message: str = "No nodes found.") -> None:
    if not nodes:
        console.print(f"[dim]{empty_message}[/dim]")
        return

    table = Table(title=title, header_style="bold")
    table.add_column("ID", style="bold")
    table.add_column("Type")
    table.add_column("Status")
    table.add_column("Tags")
    table.add_column("Conf.", justify="right")
    table.add_column("Modified")
    table.add_column("Preview")

    for node in nodes:
        table.add_row(
            node.id,
            type_badge(node.type),
            status_badge(node.status),
            ", ".join(node.tags) or "-",
            f"{node.confidence:.2f}" if node.confidence is not None else "-",
            node.modified,
            snippet(node.content),
        )
    console.print(table)
