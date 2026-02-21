# Backend Python Rules

## Agent Factory Convention
```python
def create_agent_name(storage: StorageProvider) -> Agent:
    agent = Agent(name="...", agent_type="...", storage=storage, instructions="...")
    agent.tools.register("tool_name", tool_fn, "description", {json_schema})
    return agent
```

## Tool Function Signature
```python
def tool_name(agent: Agent, param1: str = "", param2: int = 0) -> str:
    # 1. Do computation
    result = process(param1)
    # 2. Box structured data for widgets (side-effect)
    agent.box("category/key", result)
    # 3. Return text string for Claude to reason about
    return json.dumps(result)
```

## Router Isolation
- Each feature gets its own file in `backend/src/routers/`
- NEVER add route handlers to `main.py`
- Register new routers in `main.py` with `app.include_router(new_router.router)`

## Storage Keys
- Format: `"{category}/{key}"` — e.g., `"research/results"`, `"agents/status"`
- Max 2 levels with `/` separator
- Keys must be unique across all agents (merged in box endpoint)

## Agent Registry
- Add new agents to `AGENT_FACTORIES` dict in `backend/src/agents/__init__.py`
- Import the factory function and add the mapping
