"""Abstract base class for storage providers."""

import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class StorageProvider(ABC):
    """
    Swappable key-value storage backend for agent box/unbox pattern.

    Keys are simple strings, max 2 levels with / separator
    (e.g., "search/results"). Values must be JSON-serializable.
    """

    @abstractmethod
    def set(self, agent_type: str, key: str, value: Any) -> None:
        """Store a JSON-serializable value."""
        ...

    @abstractmethod
    def get(self, agent_type: str, key: str, default: Any = None) -> Any:
        """Retrieve a value. Return default if not found."""
        ...

    @abstractmethod
    def delete(self, agent_type: str, key: str) -> bool:
        """Delete a key. Return True if key existed, False otherwise."""
        ...

    @abstractmethod
    def list_keys(self, agent_type: str) -> list[str]:
        """Return all keys for an agent type."""
        ...

    @abstractmethod
    def get_all(self, agent_type: str) -> dict[str, Any]:
        """Return all key-value pairs for an agent type."""
        ...
