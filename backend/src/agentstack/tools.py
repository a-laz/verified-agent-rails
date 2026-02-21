"""Agent Stack Tool Registry.

A simple dict-backed registry for tool functions.  No decorators — tools are
registered explicitly via ``register()`` calls in agent factory functions.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from .agent import Agent

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Registry that maps tool names to callable functions + Anthropic schemas."""

    def __init__(self) -> None:
        self._tools: dict[str, dict[str, Any]] = {}

    def register(
        self,
        name: str,
        fn: Callable[..., str],
        description: str,
        parameters: dict[str, Any],
    ) -> None:
        """Add a tool to the registry."""
        logger.debug("Registering tool: name=%s, description=%s", name, description[:80])
        self._tools[name] = {
            "fn": fn,
            "description": description,
            "parameters": parameters,
        }

    def get_schema(self) -> list[dict[str, Any]]:
        """Return Anthropic-compatible tool schemas."""
        return [
            {
                "name": name,
                "description": tool["description"],
                "input_schema": tool["parameters"],
            }
            for name, tool in self._tools.items()
        ]

    def execute(self, tool_name: str, agent: "Agent | None", **kwargs: Any) -> str:
        """Call a registered tool by name."""
        logger.info("Executing tool: name=%s, args=%s", tool_name, list(kwargs.keys()))
        if tool_name not in self._tools:
            logger.error("Tool not found: %s (registered: %s)", tool_name, list(self._tools.keys()))
            raise KeyError(f"Tool '{tool_name}' is not registered")
        try:
            result = self._tools[tool_name]["fn"](agent, **kwargs)
            logger.debug("Tool '%s' executed successfully, result_length=%d", tool_name, len(result) if result else 0)
            return result
        except Exception as e:
            logger.error("Tool '%s' execution failed: %s", tool_name, e, exc_info=True)
            raise

    def has(self, name: str) -> bool:
        return name in self._tools

    def names(self) -> list[str]:
        return list(self._tools.keys())

    def __len__(self) -> int:
        return len(self._tools)
