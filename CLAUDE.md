# Agent Stack Template — CLAUDE.md

## What This Is

A minimal multi-agent app template for hackathons. Specialist AI agents collaborate via an Orchestrator, with structured data flowing to a real-time dashboard. Built on Anthropic's Claude API with tool use.

## Architecture

```
frontend/ (Next.js 14)          backend/ (FastAPI + Python)
├─ components/shell/            ├─ src/main.py (FastAPI app)
├─ components/dashboard/        ├─ src/routers/ (chat, box, agents)
├─ components/rail/             ├─ src/agents/ (orchestrator, researcher)
├─ contexts/ (Chat, BoxCache)   ├─ src/agentstack/ (agent.py, brain.py, tools.py, types.py)
├─ agents/ExampleApp/           └─ src/agentstack/storage/ (memory, local)
│   ├─ manifest.ts
│   └─ components/widgets/
packages/
├─ agent-core/ (types, manifest interfaces)
└─ agent-ui/ (design system, widget primitives)
```

## Agent Topology

```
User → Orchestrator (Director) — coordinates, does NOT analyze
         └── Researcher — search_knowledge tool (example specialist)
```

Max 3 orchestration rounds. Add more specialists as needed.

## Critical Rules

1. **Keep it simple**: No decorators, no event bus, no plugin system. Plain functions and classes.
2. **Box schemas are contracts**: All box data formats MUST match `contracts/box_schemas.md` exactly. Widgets and tools both reference these. Field name mismatch = broken dashboard.
3. **SSE for streaming**: Backend streams via Server-Sent Events (see `contracts/sse_events.md`). Frontend uses POST fetch + ReadableStream, NOT WebSocket, NOT polling for chat.
4. **Box polling for widgets**: Frontend polls `GET /api/box/Orchestrator` every 2s for widget data. NOT SSE for box state.
5. **StreamChunk contract**: `Brain.think_stream()` yields `StreamChunk` objects, NOT raw Anthropic SDK events. See `contracts/sse_events.md`.
6. **Router isolation**: Each feature gets its own router file under `backend/src/routers/`. Never modify `main.py` to add routes — create a new router file instead.
7. **No secrets in code**: `.env` files for API keys. Already in `.gitignore`.
8. **Agent factory pattern**: Each agent is created by a `create_<name>(storage)` function. Register in `AGENT_FACTORIES` dict.

## Key References

| Reference | Location |
|-----------|----------|
| **Agent contracts** | `AGENTS.md` |
| **Box data contracts** | `contracts/box_schemas.md` |
| **SSE event contracts** | `contracts/sse_events.md` |
| **Storage interface** | `contracts/storage_interface.md` |
| **Agent constructor** | `contracts/agent_constructor.md` |
| **Adding agents guide** | `docs/ADDING_AGENTS.md` |
| **Adding widgets guide** | `docs/ADDING_WIDGETS.md` |
| **Progress tracker** | `plans/PROGRESS.md` |

## Common Commands

```bash
# Install everything (from repo root)
npm install

# Backend
cd backend && pip install -r requirements.txt
cd backend && uvicorn src.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev      # dev server on :3000
cd frontend && npm run build    # type-check + build
```

## How to Extend

1. **Add a new agent**: See `docs/ADDING_AGENTS.md`
2. **Add a new widget**: See `docs/ADDING_WIDGETS.md`
3. **Add a new tool**: Define function with `(agent: Agent, **kwargs) -> str` signature, register in agent factory
4. **Change storage**: Set `STORAGE_BACKEND=local` in `.env` for file-based persistence
