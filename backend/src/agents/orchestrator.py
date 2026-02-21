"""Orchestrator agent — the Director who coordinates the team.

Delegates to specialist agents, aggregates results, produces a summary.
Max 3 delegation rounds.
"""

from __future__ import annotations

import json
import logging
from typing import Any, TYPE_CHECKING

from src.agentstack.agent import Agent
from src.agents.researcher import create_researcher

if TYPE_CHECKING:
    from src.agentstack.storage.base import StorageProvider

logger = logging.getLogger(__name__)


_DEFAULT_STATUS: list[dict[str, Any]] = [
    {"name": "Orchestrator", "persona": "Director", "status": "idle", "task": None},
    {"name": "Researcher", "persona": "Researcher", "status": "idle", "task": None},
]


def _get_status(agent: Agent) -> list[dict[str, Any]]:
    """Get current agents/status from storage, initializing defaults if needed."""
    status = agent.unbox("agents/status")
    if status is None:
        status = [dict(s) for s in _DEFAULT_STATUS]
        agent.box("agents/status", status)
    return status


def _update_agent_status(agent: Agent, agent_name: str, status: str, task: str | None = None) -> None:
    """Update a specific agent's status in the agents/status box."""
    statuses = _get_status(agent)
    for entry in statuses:
        if entry["name"] == agent_name:
            entry["status"] = status
            entry["task"] = task
            break
    agent.box("agents/status", statuses)


def _delegate_to_researcher(agent: Agent, query: str = "") -> str:
    """Delegate a query to the Researcher for knowledge search."""
    logger.info("Delegating to Researcher: %s", query[:120])
    _update_agent_status(agent, "Researcher", "thinking", f"Researching: {query[:80]}")
    try:
        sub_agent = create_researcher(agent.storage)
        response = sub_agent.think([{"role": "user", "content": query}])
        _update_agent_status(agent, "Researcher", "done", "Research complete")
        return response.content or "[Researcher returned no content]"
    except Exception as exc:
        logger.error("Researcher delegation failed", exc_info=True)
        _update_agent_status(agent, "Researcher", "error", str(exc)[:80])
        return f"Error delegating to Researcher: {exc}"


def _compile_summary(agent: Agent, query: str = "", findings: str = "", recommendations: str = "") -> str:
    """Compile a summary with findings and recommendations."""
    logger.info("Compiling summary for: %s", query[:120])
    recs_list: list[str] = []
    try:
        parsed = json.loads(recommendations) if recommendations else []
        if isinstance(parsed, list):
            recs_list = [str(r) for r in parsed]
    except (json.JSONDecodeError, TypeError):
        if recommendations:
            recs_list = [s.strip() for s in recommendations.split("\n") if s.strip()]

    report = {
        "query": query,
        "findings": findings,
        "recommendations": recs_list,
    }
    agent.box("research/summary", report)
    return f"Summary compiled for: '{query}' with {len(recs_list)} recommendations."


def create_orchestrator(storage: "StorageProvider") -> Agent:
    """Create and return an Orchestrator agent instance."""
    agent = Agent(
        name="orchestrator",
        agent_type="Orchestrator",
        model="claude-sonnet-4-6",
        instructions=(
            "You are the Director (Orchestrator) of this application.\n"
            "Your job is to coordinate the research team. You do NOT perform research yourself.\n"
            "Parse the user's query, delegate to specialists using your tools, aggregate results,\n"
            "and produce a clear summary with recommendations.\n"
            "Max 3 delegation rounds."
        ),
        storage=storage,
    )

    _get_status(agent)

    agent.tools.register(
        "delegate_to_researcher",
        _delegate_to_researcher,
        "Delegate a query to the Researcher for knowledge search and analysis",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The query for the Researcher"}
            },
            "required": ["query"],
        },
    )

    agent.tools.register(
        "compile_summary",
        _compile_summary,
        "Compile the final summary with findings and recommendations",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The original user query"},
                "findings": {"type": "string", "description": "Key findings from research"},
                "recommendations": {"type": "string", "description": "JSON array of recommendation strings"},
            },
            "required": ["query"],
        },
    )

    return agent
