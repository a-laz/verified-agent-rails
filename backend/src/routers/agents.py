"""Agents router — GET /api/agents for listing available agents."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from src.agents import AGENT_FACTORIES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("")
async def list_agents():
    """Return list of registered agent type names."""
    return [{"name": name} for name in AGENT_FACTORIES.keys()]
