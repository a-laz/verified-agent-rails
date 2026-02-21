"""Local JSON-file-backed storage provider."""

import json
import logging
import os
from typing import Any

from .base import StorageProvider

logger = logging.getLogger(__name__)


def _sanitize_key(key: str) -> str:
    if ".." in key or key.startswith("/") or key.startswith("\\"):
        raise ValueError(f"Invalid key: {key!r} (path traversal not allowed)")
    return key.replace("/", "__")


def _unsanitize_key(filename: str) -> str:
    name = filename
    if name.endswith(".json"):
        name = name[: -len(".json")]
    return name.replace("__", "/")


class LocalStorageProvider(StorageProvider):
    """JSON-file-backed storage provider."""

    def __init__(self, base_dir: str = ".agentstack_storage") -> None:
        self._base_dir = base_dir
        logger.info("LocalStorageProvider initialized with base_dir=%s", base_dir)

    def _agent_dir(self, agent_type: str) -> str:
        return os.path.join(self._base_dir, agent_type)

    def _key_path(self, agent_type: str, key: str) -> str:
        sanitized = _sanitize_key(key)
        return os.path.join(self._agent_dir(agent_type), f"{sanitized}.json")

    def set(self, agent_type: str, key: str, value: Any) -> None:
        path = self._key_path(agent_type, key)
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(value, f, indent=2)
        except Exception:
            logger.error("local.set failed for %s/%s at %s", agent_type, key, path, exc_info=True)
            raise

    def get(self, agent_type: str, key: str, default: Any = None) -> Any:
        path = self._key_path(agent_type, key)
        if not os.path.isfile(path):
            return default
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            logger.error("local.get failed to read %s/%s at %s", agent_type, key, path, exc_info=True)
            return default

    def delete(self, agent_type: str, key: str) -> bool:
        path = self._key_path(agent_type, key)
        if os.path.isfile(path):
            try:
                os.remove(path)
                return True
            except OSError:
                logger.error("local.delete failed for %s/%s at %s", agent_type, key, path, exc_info=True)
                raise
        return False

    def list_keys(self, agent_type: str) -> list[str]:
        agent_dir = self._agent_dir(agent_type)
        if not os.path.isdir(agent_dir):
            return []
        keys = []
        for filename in os.listdir(agent_dir):
            if filename.endswith(".json"):
                keys.append(_unsanitize_key(filename))
        return keys

    def get_all(self, agent_type: str) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key in self.list_keys(agent_type):
            value = self.get(agent_type, key)
            if value is not None:
                result[key] = value
        return result
