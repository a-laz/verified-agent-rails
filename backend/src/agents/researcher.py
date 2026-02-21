"""Researcher agent — example specialist that searches a knowledge base.

This is a template agent. Replace the search_knowledge tool with your
domain-specific data access logic.
"""

from __future__ import annotations

import json
import logging
from typing import Any, TYPE_CHECKING

from src.agentstack.agent import Agent

if TYPE_CHECKING:
    from src.agentstack.storage.base import StorageProvider

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sample knowledge base — replace with your domain data
# ---------------------------------------------------------------------------
KNOWLEDGE_BASE = [
    {"id": "KB-001", "topic": "Getting Started", "content": "Welcome to the template. This is a sample knowledge base entry."},
    {"id": "KB-002", "topic": "Architecture", "content": "The system uses an Orchestrator that delegates to specialist agents."},
    {"id": "KB-003", "topic": "Storage", "content": "Data is stored via box/unbox pattern with swappable backends (memory, local)."},
    {"id": "KB-004", "topic": "Streaming", "content": "Responses stream via SSE. The Brain yields StreamChunk objects."},
    {"id": "KB-005", "topic": "Widgets", "content": "Frontend widgets read box data via useBox() hook with 2-second polling."},
]


def _search_knowledge(agent: Agent, query: str = "", max_results: int = 5) -> str:
    """Search the knowledge base for entries matching the query."""
    logger.info("Searching knowledge base: %s", query[:120])
    query_lower = query.lower()
    results = [
        entry for entry in KNOWLEDGE_BASE
        if query_lower in entry["topic"].lower() or query_lower in entry["content"].lower()
    ]
    if not results:
        results = KNOWLEDGE_BASE[:max_results]

    agent.box("research/results", results)
    return json.dumps(results, indent=2)


def create_researcher(storage: "StorageProvider") -> Agent:
    """Create and return a Researcher agent instance."""
    agent = Agent(
        name="researcher",
        agent_type="Researcher",
        model="claude-sonnet-4-6",
        instructions=(
            "You are the Researcher. Your job is to search the knowledge base\n"
            "and return relevant information. Use your search_knowledge tool to\n"
            "find data, then summarize the findings clearly."
        ),
        storage=storage,
    )

    agent.tools.register(
        "search_knowledge",
        _search_knowledge,
        "Search the knowledge base for entries matching a query",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "description": "Max results to return", "default": 5},
            },
            "required": ["query"],
        },
    )

    return agent
