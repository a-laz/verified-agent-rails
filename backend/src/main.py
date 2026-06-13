"""Agent Stack Backend — FastAPI application entry point.

Run with:
    uvicorn src.main:app --reload --port 8000
"""

import logging
import os

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import chat, box, agents, var
from src.agentstack.storage import InMemoryStorageProvider, LocalStorageProvider


def get_storage_provider():
    """Factory that returns the storage provider based on STORAGE_BACKEND env var."""
    backend = os.getenv("STORAGE_BACKEND", "memory").lower()
    logger.info("STORAGE_BACKEND=%s", backend)
    if backend == "local":
        return LocalStorageProvider()
    else:
        return InMemoryStorageProvider()


app = FastAPI(
    title="Agent Stack API",
    description="Multi-agent AI application powered by Agent Stack",
    version="0.1.0",
)

# Shared storage — single instance used by all routers and agents
app.state.storage = get_storage_provider()
logger.info("Storage: %s", type(app.state.storage).__name__)

# CORS
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_prod_origin = os.getenv("FRONTEND_URL")
if _prod_origin:
    CORS_ORIGINS.append(_prod_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # Dev convenience: allow any localhost port — the Next dev server falls back to
    # :3001+ when :3000 is taken. Production still pins explicit origins / FRONTEND_URL.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(chat.router)
app.include_router(box.router)
app.include_router(agents.router)
app.include_router(var.router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "agent-stack-backend"}
