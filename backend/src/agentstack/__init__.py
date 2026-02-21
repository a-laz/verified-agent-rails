"""Agent Stack — simplified agent runtime for multi-agent AI applications.

Public API
----------
Agent         The core agent class (Brain + ToolRegistry + Storage).
Brain         Anthropic SDK wrapper (think / think_stream).
ToolRegistry  Dict-backed tool registry with Anthropic-format schemas.
StreamChunk   The streaming contract between Brain and the SSE layer.
BrainResponse Structured response from a synchronous Brain.think() call.
Message       A single conversation message (role + content).
"""

from .agent import Agent
from .brain import Brain
from .tools import ToolRegistry
from .types import BrainResponse, Message, StreamChunk

__all__ = [
    "Agent",
    "Brain",
    "BrainResponse",
    "Message",
    "StreamChunk",
    "ToolRegistry",
]
