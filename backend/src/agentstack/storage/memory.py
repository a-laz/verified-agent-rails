"""In-memory storage provider for testing and development."""

import logging
from typing import Any

from .base import StorageProvider

logger = logging.getLogger(__name__)


class InMemoryStorageProvider(StorageProvider):
    """Dict-based storage provider. Fast, no persistence."""

    def __init__(self) -> None:
        self._data: dict[str, dict[str, Any]] = {}
        logger.info("InMemoryStorageProvider initialized")

    def set(self, agent_type: str, key: str, value: Any) -> None:
        if agent_type not in self._data:
            self._data[agent_type] = {}
        self._data[agent_type][key] = value

    def get(self, agent_type: str, key: str, default: Any = None) -> Any:
        return self._data.get(agent_type, {}).get(key, default)

    def delete(self, agent_type: str, key: str) -> bool:
        if agent_type in self._data and key in self._data[agent_type]:
            del self._data[agent_type][key]
            return True
        return False

    def list_keys(self, agent_type: str) -> list[str]:
        return list(self._data.get(agent_type, {}).keys())

    def get_all(self, agent_type: str) -> dict[str, Any]:
        return dict(self._data.get(agent_type, {}))
