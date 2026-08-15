"""Click entry point for the `amp` command line tool."""

from __future__ import annotations

import click

from . import __version__
from .commands import (
    archive,
    distill,
    export,
    import_cmd,
    init,
    list_cmd,
    merge,
    prune,
    recall,
    reindex,
    search,
    show,
    stats,
    store_cmd,
    update,
    validate,
)


@click.group()
@click.version_option(version=__version__, prog_name="amp")
@click.option(
    "--path",
    default=None,
    help="Path to the .amp store directory (default: auto-discover from cwd).",
)
@click.pass_context
def main(ctx: click.Context, path: str | None) -> None:
    """AMP — a file-based memory protocol for AI agents."""
    ctx.ensure_object(dict)
    ctx.obj["path"] = path


main.add_command(init.init_cmd, name="init")
main.add_command(store_cmd.store_cmd, name="store")
main.add_command(recall.recall_cmd, name="recall")
main.add_command(search.search_cmd, name="search")
main.add_command(list_cmd.list_cmd, name="list")
main.add_command(show.show_cmd, name="show")
main.add_command(update.update_cmd, name="update")
main.add_command(archive.archive_cmd, name="archive")
main.add_command(merge.merge_cmd, name="merge")
main.add_command(prune.prune_cmd, name="prune")
main.add_command(distill.distill_cmd, name="distill")
main.add_command(reindex.reindex_cmd, name="reindex")
main.add_command(export.export_cmd, name="export")
main.add_command(import_cmd.import_cmd, name="import")
main.add_command(validate.validate_cmd, name="validate")
main.add_command(stats.stats_cmd, name="stats")


if __name__ == "__main__":
    main()
