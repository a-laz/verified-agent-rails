"""Agent Stack Brain — Anthropic SDK wrapper.

Encapsulates all direct communication with the Anthropic Messages API.
Provides both synchronous (``think``) and streaming (``think_stream``)
interfaces, always returning/yielding our own types (``BrainResponse`` and
``StreamChunk``) rather than raw SDK objects.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Generator

import anthropic

from .types import BrainResponse, StreamChunk, ToolCall

logger = logging.getLogger(__name__)

MAX_TOKENS = 4096  # sensible default for hackathon


class Brain:
    """Wrapper around the Anthropic Python SDK."""

    def __init__(
        self,
        model: str = "claude-sonnet-4-6",
        instructions: str = "",
        temperature: float = 0.7,
    ) -> None:
        self.model = model
        self.instructions = instructions
        self.temperature = temperature
        self.client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
        logger.info("Brain initialized: model=%s, temperature=%.1f", model, temperature)

    # ------------------------------------------------------------------
    # Synchronous call
    # ------------------------------------------------------------------
    def think(
        self,
        messages: list[dict[str, Any]],
        tools_schema: list[dict[str, Any]] | None = None,
    ) -> BrainResponse:
        """Send messages to the model and return a structured response."""
        logger.info("Brain.think() called: model=%s, messages=%d, tools=%d", self.model, len(messages), len(tools_schema) if tools_schema else 0)

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "temperature": self.temperature,
            "messages": messages,
        }
        if self.instructions:
            kwargs["system"] = self.instructions
        if tools_schema:
            kwargs["tools"] = tools_schema

        try:
            response = self.client.messages.create(**kwargs)
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in Brain.think(): %s", exc, exc_info=True)
            raise
        except Exception as exc:
            logger.error("Unexpected error in Brain.think(): %s", exc, exc_info=True)
            raise

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(id=block.id, name=block.name, input=block.input)
                )

        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }

        logger.info(
            "Brain.think() complete: stop_reason=%s, tool_calls=%d, text_length=%d, usage=%s",
            response.stop_reason, len(tool_calls), sum(len(t) for t in text_parts), usage,
        )

        return BrainResponse(
            content="".join(text_parts),
            tool_calls=tool_calls,
            stop_reason=response.stop_reason,
            usage=usage,
        )

    # ------------------------------------------------------------------
    # Streaming call — yields StreamChunk objects
    # ------------------------------------------------------------------
    def think_stream(
        self,
        messages: list[dict[str, Any]],
        tools_schema: list[dict[str, Any]] | None = None,
    ) -> Generator[StreamChunk, None, None]:
        """Stream a response from the model, yielding StreamChunk objects."""
        logger.info("Brain.think_stream() called: model=%s, messages=%d, tools=%d", self.model, len(messages), len(tools_schema) if tools_schema else 0)

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "temperature": self.temperature,
            "messages": messages,
        }
        if self.instructions:
            kwargs["system"] = self.instructions
        if tools_schema:
            kwargs["tools"] = tools_schema

        current_tool: dict[str, Any] | None = None
        tool_input_json = ""

        try:
            with self.client.messages.stream(**kwargs) as stream:
                for event in stream:
                    event_type = getattr(event, "type", None)

                    if event_type == "content_block_delta":
                        delta = event.delta
                        if getattr(delta, "type", None) == "text_delta":
                            yield StreamChunk(
                                type="text",
                                data={"delta": delta.text},
                            )
                        elif getattr(delta, "type", None) == "input_json_delta":
                            tool_input_json += delta.partial_json

                    elif event_type == "content_block_start":
                        block = event.content_block
                        if getattr(block, "type", None) == "tool_use":
                            current_tool = {
                                "id": block.id,
                                "name": block.name,
                            }
                            tool_input_json = ""

                    elif event_type == "content_block_stop":
                        if current_tool is not None:
                            try:
                                parsed_input = json.loads(tool_input_json) if tool_input_json else {}
                            except json.JSONDecodeError:
                                logger.warning("Brain stream: failed to parse tool input JSON for tool %s", current_tool.get("name"))
                                parsed_input = {}
                            yield StreamChunk(
                                type="tool_start",
                                data={
                                    "id": current_tool["id"],
                                    "name": current_tool["name"],
                                    "input": parsed_input,
                                },
                            )
                            current_tool = None
                            tool_input_json = ""

                    elif event_type == "message_stop":
                        final_message = stream.get_final_message()
                        usage = {
                            "input_tokens": final_message.usage.input_tokens,
                            "output_tokens": final_message.usage.output_tokens,
                        }
                        logger.info(
                            "Brain.think_stream() complete: stop_reason=%s, usage=%s",
                            final_message.stop_reason, usage,
                        )
                        yield StreamChunk(
                            type="done",
                            data={"usage": usage, "stop_reason": final_message.stop_reason},
                        )

        except anthropic.APIError as exc:
            logger.exception("Anthropic API error during streaming")
            yield StreamChunk(type="error", data={"message": str(exc)})
        except Exception as exc:
            logger.exception("Unexpected error during streaming")
            yield StreamChunk(type="error", data={"message": str(exc)})
