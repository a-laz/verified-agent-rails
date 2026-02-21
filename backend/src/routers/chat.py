"""Chat router — POST /api/chat/stream (SSE) and POST /api/chat (sync).

SSE events follow contracts/sse_events.md:
  event: text       data: {"delta": "..."}
  event: tool_start data: {"id": "...", "name": "...", "input": {...}}
  event: tool_result data: {"id": "...", "name": "...", "result": "..."}
  event: done       data: {"usage": {...}}
  event: error      data: {"message": "..."}
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from src.agents import get_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    agent: str = "Orchestrator"


@router.post("")
async def chat_sync(body: ChatRequest, request: Request):
    """Synchronous chat turn (for testing)."""
    storage = request.app.state.storage
    try:
        agent = get_agent(body.agent, storage)
        response = agent.think(body.messages)
        return {
            "content": response.content,
            "stop_reason": response.stop_reason,
            "usage": response.usage,
        }
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception as exc:
        logger.exception("Error in /api/chat")
        return JSONResponse(status_code=500, content={"error": str(exc)})


class StreamRequest(BaseModel):
    messages: list[dict[str, Any]]
    agent: str = "Orchestrator"


@router.post("/stream")
async def chat_stream_post(body: StreamRequest, request: Request):
    """Stream a chat response via SSE (POST — used by frontend)."""
    storage = request.app.state.storage

    async def event_generator():
        try:
            agent_instance = get_agent(body.agent, storage)
        except ValueError as exc:
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}
            return
        try:
            for chunk in agent_instance.think_stream(body.messages):
                yield {"event": chunk.type, "data": json.dumps(chunk.data)}
        except Exception as exc:
            logger.exception("Error during SSE streaming")
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}

    return EventSourceResponse(event_generator())


@router.get("/stream")
async def chat_stream_get(
    request: Request,
    messages: str = Query(..., description="JSON-encoded message array"),
    agent: str = Query("Orchestrator", description="Agent type name"),
):
    """Stream a chat response via SSE (GET — fallback)."""
    try:
        parsed_messages = json.loads(messages)
    except json.JSONDecodeError as exc:
        async def error_stream():
            yield {"event": "error", "data": json.dumps({"message": f"Invalid messages JSON: {exc}"})}
        return EventSourceResponse(error_stream())

    storage = request.app.state.storage

    async def event_generator():
        try:
            agent_instance = get_agent(agent, storage)
        except ValueError as exc:
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}
            return
        try:
            for chunk in agent_instance.think_stream(parsed_messages):
                yield {"event": chunk.type, "data": json.dumps(chunk.data)}
        except Exception as exc:
            logger.exception("Error during SSE streaming")
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}

    return EventSourceResponse(event_generator())
