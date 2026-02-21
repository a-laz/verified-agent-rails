"""Agent Stack shared types.

Dataclasses used across the agent runtime: messages, tool calls, brain
responses, and the StreamChunk contract consumed by the SSE layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Union


@dataclass
class Message:
    """A single message in a conversation."""
    role: str
    content: Union[str, list[dict[str, Any]]]


@dataclass
class ToolCall:
    """A tool invocation requested by the model."""
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class ToolResult:
    """The result of executing a tool."""
    tool_use_id: str
    content: str


@dataclass
class BrainResponse:
    """Structured response from a Brain.think() call."""
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop_reason: str = ""
    usage: dict[str, Any] = field(default_factory=dict)


@dataclass
class StreamChunk:
    """A single streaming event yielded by Brain.think_stream().

    The SSE router serializes these directly to Server-Sent Events.
    """
    type: str  # "text" | "tool_start" | "tool_result" | "box_update" | "done" | "error"
    data: dict[str, Any] = field(default_factory=dict)
