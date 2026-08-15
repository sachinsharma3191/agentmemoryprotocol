"""amp-python: a file-based memory protocol for AI agents.

Public programmatic API:

    from amp import AmpStore

    store = AmpStore(".amp")
    store.init(name="My Memory", agent_id="my-agent")
    node = store.store("Python is preferred", type="preference", tags=["python"])
    results = store.recall("python backend")
    results = store.search("python", type="preference")
    nodes = store.list(type="fact")
    node = store.show("python-preferred")
    store.validate()
    stats = store.stats()
"""

from .store import (
    AmpError,
    AmpStore,
    NodeExistsError,
    NodeNotFoundError,
    StoreExistsError,
    StoreNotFoundError,
    ValidationIssue,
)
from .types import Link, Node

__all__ = [
    "AmpStore",
    "AmpError",
    "StoreNotFoundError",
    "StoreExistsError",
    "NodeNotFoundError",
    "NodeExistsError",
    "ValidationIssue",
    "Node",
    "Link",
]

__version__ = "0.1.0"
