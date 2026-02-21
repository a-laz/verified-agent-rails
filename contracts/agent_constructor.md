# Agent Constructor Contract

## Factory Pattern

Every agent is created by a factory function:

```python
from src.agentstack import Agent, StorageProvider

def create_agent_name(storage: StorageProvider) -> Agent:
    agent = Agent(
        name="HumanReadableName",
        agent_type="AgentType",
        storage=storage,
        instructions="System prompt for this agent..."
    )

    agent.tools.register(
        name="tool_name",
        fn=tool_function,
        description="What this tool does",
        parameters={
            "type": "object",
            "properties": {
                "param1": {"type": "string", "description": "..."}
            },
            "required": ["param1"]
        }
    )

    return agent
```

## Registration

Add factory to `AGENT_FACTORIES` in `backend/src/agents/__init__.py`:

```python
from .my_agent import create_my_agent

AGENT_FACTORIES = {
    "Orchestrator": create_orchestrator,
    "Researcher": create_researcher,
    "MyAgent": create_my_agent,  # ← add here
}
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

## Rules
- Factory receives `storage` — pass it to `Agent()`
- Tool functions receive `agent` as first parameter (injected by runtime)
- Tool functions MUST return a string (JSON-serialized for structured data)
- Box calls are side-effects — they don't affect the return value
- Parameter schemas follow JSON Schema format (for Anthropic tool_use)
