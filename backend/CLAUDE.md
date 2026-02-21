# Backend — CLAUDE.md

## Stack
- Python 3.10+, FastAPI, Anthropic SDK
- No pandas, no heavy dependencies

## Project Layout
```
backend/src/
├─ main.py              # App factory, CORS, storage, router registration
├─ routers/
│   ├─ chat.py          # POST /api/chat/stream (SSE)
│   ├─ box.py           # GET /api/box/{agent_type}
│   └─ agents.py        # GET /api/agents
├─ agents/
│   ├─ __init__.py      # AGENT_FACTORIES registry + get_agent()
│   ├─ orchestrator.py  # create_orchestrator(storage) → Agent
│   └─ researcher.py    # create_researcher(storage) → Agent
└─ agentstack/
    ├─ agent.py         # Agent class (think, think_stream, box, unbox)
    ├─ brain.py         # Brain class (Claude API wrapper)
    ├─ tools.py         # ToolRegistry (register, execute, get_schemas)
    ├─ types.py         # Message, ToolCall, ToolResult, StreamChunk
    └─ storage/
        ├─ base.py      # StorageProvider ABC
        ├─ memory.py    # InMemoryStorageProvider
        └─ local.py     # LocalStorageProvider (JSON files)
```

## Patterns

### Agent Factory
```python
def create_agent_name(storage: StorageProvider) -> Agent:
    agent = Agent(name="...", agent_type="...", storage=storage, instructions="...")
    agent.tools.register("tool_name", tool_fn, "description", {json_schema})
    return agent
```

### Tool Function Signature
```python
def tool_name(agent: Agent, param1: str = "", param2: int = 0) -> str:
    result = process(param1)
    agent.box("category/key", result)  # side-effect: widget data
    return json.dumps(result)          # text for Claude to reason about
```

### Box Pattern
- `agent.box(key, data)` — stores structured data for frontend widgets
- `agent.unbox(key)` — retrieves stored data
- Keys format: `"category/key"` (max 2 levels)

### StreamChunk
```python
StreamChunk(type="text"|"tool_start"|"tool_result"|"done"|"error", content="...")
```

### Storage
- `app.state.storage` holds the active StorageProvider
- Toggle via `STORAGE_BACKEND` env var: `memory` (default) or `local`
- All agents share the same storage instance

## Rules
- New routes → new file in `routers/`, register in `main.py`
- New agents → new file in `agents/`, add to `AGENT_FACTORIES` in `__init__.py`
- Tool functions return strings, box structured data as side-effects
- Never import from `agentstack` internals — use the public API from `agentstack/__init__.py`
