"""Box router — GET/POST /api/box/{agent_type}/{key} for widget data.

GET  /api/box/{agent_type}       -> flat dict merged across ALL agent types
GET  /api/box/{agent_type}/{key} -> raw JSON value
POST /api/box/{agent_type}/{key} -> {"ok": true}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Body
from fastapi.responses import JSONResponse

from src.agents import AGENT_FACTORIES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/box", tags=["box"])


@router.get("/{agent_type}")
async def get_all_box(agent_type: str, request: Request):
    """Return all box state as a flat dict, merging across all agent types."""
    storage = request.app.state.storage
    try:
        result: dict[str, Any] = {}
        for at in AGENT_FACTORIES.keys():
            result.update(storage.get_all(at))
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{agent_type}/{key:path}")
async def get_box_value(agent_type: str, key: str, request: Request):
    """Return a single box value as raw JSON."""
    storage = request.app.state.storage
    try:
        value = storage.get(agent_type, key)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    if value is None:
        return JSONResponse(status_code=404, content={"error": f"Key '{key}' not found"})
    return value


@router.post("/{agent_type}/{key:path}")
async def set_box_value(agent_type: str, key: str, request: Request, value: Any = Body(...)):
    """Set a box value. Body is the raw value."""
    storage = request.app.state.storage
    try:
        storage.set(agent_type, key, value)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"ok": True}
