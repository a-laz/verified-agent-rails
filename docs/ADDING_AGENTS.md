# Adding a New Agent

Step-by-step guide to adding a specialist agent to the stack.

## 1. Create the Agent File

Create `backend/src/agents/my_specialist.py`:

```python
import json
from src.agentstack import Agent, StorageProvider


def search_data(agent: Agent, query: str = "") -> str:
    """Example tool — replace with your domain logic."""
    results = [{"item": "Example", "score": 0.9}]

    # Box data for frontend widget
    agent.box("mydata/results", {
        "query": query,
        "results": results,
        "timestamp": "2024-01-01T00:00:00Z"
    })

    return json.dumps(results)


def create_my_specialist(storage: StorageProvider) -> Agent:
    agent = Agent(
        name="MySpecialist",
        agent_type="MySpecialist",
        storage=storage,
        instructions="""You are a specialist agent.
Your role is to analyze data using your tools.
Always use search_data to find relevant information before answering."""
    )

    agent.tools.register(
        name="search_data",
        fn=search_data,
        description="Search the dataset for relevant items",
        parameters={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query"
                }
            },
            "required": ["query"]
        }
    )

    return agent
```

## 2. Register the Agent

Edit `backend/src/agents/__init__.py`:

```python
from .my_specialist import create_my_specialist

AGENT_FACTORIES = {
    "Orchestrator": create_orchestrator,
    "Researcher": create_researcher,
    "MySpecialist": create_my_specialist,  # ← add
}
```

## 3. Wire into Orchestrator

Add a delegation tool in `backend/src/agents/orchestrator.py`:

```python
def delegate_to_my_specialist(agent: Agent, query: str = "") -> str:
    specialist = get_agent("MySpecialist", agent.storage)
    response = specialist.think(query)
    return response.content
```

Register it in `create_orchestrator()`:
```python
agent.tools.register("delegate_to_my_specialist", delegate_to_my_specialist, ...)
```

## 4. Add Box Schema

Document the box key in `contracts/box_schemas.md`:

```markdown
## mydata/results
Written by: MySpecialist
Read by: MyDataWidget

{
  "query": "...",
  "results": [{ "item": "...", "score": 0.9 }],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## 5. Create Widget (Optional)

See `docs/ADDING_WIDGETS.md` for creating a frontend widget that reads the boxed data.

## 6. Update AGENTS.md

Add the new agent to the topology and box key registry in `AGENTS.md`.

## Checklist

- [ ] Agent file created in `backend/src/agents/`
- [ ] Factory registered in `AGENT_FACTORIES`
- [ ] Delegation tool added to Orchestrator
- [ ] Box schema documented in `contracts/box_schemas.md`
- [ ] Widget created (if applicable)
- [ ] `AGENTS.md` updated
