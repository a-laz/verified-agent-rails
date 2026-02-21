"""Agent Stack Agent — the core runtime unit.

An Agent wraps a Brain (Anthropic SDK), a ToolRegistry, and an optional
StorageProvider.  It manages the tool-execution loop so callers just send
messages and receive final (or streamed) responses.
"""

from __future__ import annotations

import logging
from typing import Any, Generator

from .brain import Brain
from .tools import ToolRegistry
from .types import BrainResponse, Message, StreamChunk, ToolCall

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 10  # safety limit to prevent infinite tool loops


class Agent:
    """A single AI agent instance.

    Args:
        name: Human-readable instance name (e.g. ``"orchestrator-1"``).
        agent_type: Logical type name (e.g. ``"Orchestrator"``).  Used as the
            namespace key for storage operations.
        model: Anthropic model identifier.
        instructions: System prompt forwarded to the Brain.
        storage: Optional ``StorageProvider`` for box/unbox.
        temperature: Sampling temperature for the Brain.
    """

    def __init__(
        self,
        name: str,
        agent_type: str,
        model: str = "claude-sonnet-4-6",
        instructions: str = "",
        storage: Any | None = None,
        temperature: float = 0.7,
    ) -> None:
        self.name = name
        self.agent_type = agent_type
        self.storage = storage
        self.brain = Brain(model=model, instructions=instructions, temperature=temperature)
        self.tools = ToolRegistry()
        logger.info("Agent created: name=%s, type=%s, model=%s", name, agent_type, model)

    # ------------------------------------------------------------------
    # Synchronous think — full tool loop
    # ------------------------------------------------------------------
    def think(self, messages: list[dict[str, Any]]) -> BrainResponse:
        """Run a full conversation turn, automatically executing tools."""
        logger.info("Agent '%s' think() called with %d messages", self.name, len(messages))
        tools_schema = self.tools.get_schema() or None
        working_messages = list(messages)

        for _round in range(MAX_TOOL_ROUNDS):
            logger.debug("Agent '%s' tool round %d/%d", self.name, _round + 1, MAX_TOOL_ROUNDS)
            try:
                response = self.brain.think(working_messages, tools_schema)
            except Exception:
                logger.error("Agent '%s' brain.think() failed on round %d", self.name, _round + 1, exc_info=True)
                raise

            if not response.tool_calls:
                logger.info("Agent '%s' think() complete after %d round(s), stop_reason=%s", self.name, _round + 1, response.stop_reason)
                return response

            # Build the assistant message with tool_use blocks
            assistant_content: list[dict[str, Any]] = []
            if response.content:
                assistant_content.append({"type": "text", "text": response.content})
            for tc in response.tool_calls:
                assistant_content.append({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": tc.input,
                })
            working_messages.append({"role": "assistant", "content": assistant_content})

            # Execute each tool and build tool_result blocks
            logger.debug("Agent '%s' executing %d tool call(s): %s", self.name, len(response.tool_calls), [tc.name for tc in response.tool_calls])
            tool_results: list[dict[str, Any]] = []
            for tc in response.tool_calls:
                logger.debug("Agent '%s' executing tool '%s' with args: %s", self.name, tc.name, list(tc.input.keys()))
                try:
                    result_str = self.tools.execute(tc.name, self, **tc.input)
                    logger.debug("Agent '%s' tool '%s' returned %d chars", self.name, tc.name, len(result_str) if result_str else 0)
                except Exception as exc:
                    logger.error("Agent '%s' tool '%s' raised an error: %s", self.name, tc.name, exc, exc_info=True)
                    result_str = f"Error: {exc}"
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc.id,
                    "content": result_str,
                })
            working_messages.append({"role": "user", "content": tool_results})

        # If we exhausted rounds, return whatever we have
        logger.warning("Agent '%s' hit max tool rounds (%d)", self.name, MAX_TOOL_ROUNDS)
        return response  # type: ignore[possibly-undefined]

    # ------------------------------------------------------------------
    # Streaming think — yields StreamChunks
    # ------------------------------------------------------------------
    def think_stream(self, messages: list[dict[str, Any]]) -> Generator[StreamChunk, None, None]:
        """Stream a conversation turn, executing tools inline."""
        logger.info("Agent '%s' think_stream() called with %d messages", self.name, len(messages))
        tools_schema = self.tools.get_schema() or None
        working_messages = list(messages)

        for _round in range(MAX_TOOL_ROUNDS):
            logger.debug("Agent '%s' streaming round %d/%d", self.name, _round + 1, MAX_TOOL_ROUNDS)
            pending_tool_calls: list[ToolCall] = []
            collected_text = ""

            for chunk in self.brain.think_stream(working_messages, tools_schema):
                if chunk.type == "text":
                    collected_text += chunk.data.get("delta", "")
                    yield chunk

                elif chunk.type == "tool_start":
                    pending_tool_calls.append(
                        ToolCall(
                            id=chunk.data["id"],
                            name=chunk.data["name"],
                            input=chunk.data.get("input", {}),
                        )
                    )
                    yield chunk

                elif chunk.type == "done":
                    stop_reason = chunk.data.get("stop_reason", "end_turn")
                    if stop_reason != "tool_use":
                        yield chunk
                        return
                    break

                elif chunk.type == "error":
                    yield chunk
                    return

                else:
                    yield chunk

            if not pending_tool_calls:
                yield StreamChunk(type="done", data={})
                return

            # Build assistant message with tool_use blocks
            assistant_content: list[dict[str, Any]] = []
            if collected_text:
                assistant_content.append({"type": "text", "text": collected_text})
            for tc in pending_tool_calls:
                assistant_content.append({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": tc.input,
                })
            working_messages.append({"role": "assistant", "content": assistant_content})

            # Execute tools and yield results
            logger.debug("Agent '%s' stream executing %d tool(s): %s", self.name, len(pending_tool_calls), [tc.name for tc in pending_tool_calls])
            tool_results: list[dict[str, Any]] = []
            for tc in pending_tool_calls:
                logger.debug("Agent '%s' stream executing tool '%s' with args: %s", self.name, tc.name, list(tc.input.keys()))
                try:
                    result_str = self.tools.execute(tc.name, self, **tc.input)
                    logger.debug("Agent '%s' stream tool '%s' returned %d chars", self.name, tc.name, len(result_str) if result_str else 0)
                except Exception as exc:
                    logger.error("Agent '%s' stream tool '%s' raised an error: %s", self.name, tc.name, exc, exc_info=True)
                    result_str = f"Error: {exc}"

                yield StreamChunk(
                    type="tool_result",
                    data={
                        "id": tc.id,
                        "name": tc.name,
                        "result": result_str,
                    },
                )
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc.id,
                    "content": result_str,
                })

            working_messages.append({"role": "user", "content": tool_results})

        # Safety: exhausted rounds
        logger.warning("Agent '%s' hit max tool rounds (%d) during streaming", self.name, MAX_TOOL_ROUNDS)
        yield StreamChunk(type="done", data={})

    # ------------------------------------------------------------------
    # Box / Unbox — storage helpers
    # ------------------------------------------------------------------
    def box(self, key: str, value: Any) -> None:
        """Store a value via the storage provider."""
        if self.storage is not None:
            logger.debug("Agent '%s' box: key=%s/%s", self.name, self.agent_type, key)
            try:
                self.storage.set(self.agent_type, key, value)
            except Exception:
                logger.error("Agent '%s' box failed: key=%s/%s", self.name, self.agent_type, key, exc_info=True)
                raise
        else:
            logger.warning("Agent '%s' box called but no storage provider set (key=%s)", self.name, key)

    def unbox(self, key: str, default: Any = None) -> Any:
        """Retrieve a value from the storage provider."""
        if self.storage is not None:
            logger.debug("Agent '%s' unbox: key=%s/%s", self.name, self.agent_type, key)
            try:
                return self.storage.get(self.agent_type, key, default)
            except Exception:
                logger.error("Agent '%s' unbox failed: key=%s/%s", self.name, self.agent_type, key, exc_info=True)
                raise
        return default
