"""Agent registry — maps agent type names to factory functions.

Usage:
    from src.agents import get_agent, AGENT_FACTORIES
    agent = get_agent("Orchestrator", storage)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Callable

logger = logging.getLogger(__name__)

from .orchestrator import create_orchestrator
from .researcher import create_researcher

if TYPE_CHECKING:
    from src.agentstack.agent import Agent
    from src.agentstack.storage.base import StorageProvider

AGENT_FACTORIES: dict[str, Callable] = {
    "Orchestrator": create_orchestrator,
    "Researcher": create_researcher,
}


def get_agent(agent_type: str, storage: "StorageProvider") -> "Agent":
    """Create an agent by type name."""
    factory = AGENT_FACTORIES.get(agent_type)
    if not factory:
        raise ValueError(f"Unknown agent type: {agent_type}")
    return factory(storage)
