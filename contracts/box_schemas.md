# Box Schemas Contract

## agents/status

Written by: Orchestrator
Read by: AgentStatusWidget

```json
{
  "agents": [
    {
      "name": "Director",
      "status": "working" | "idle" | "done" | "error",
      "lastAction": "Delegating to Researcher"
    },
    {
      "name": "Researcher",
      "status": "working" | "idle" | "done" | "error",
      "lastAction": "Searching knowledge base"
    }
  ]
}
```

## research/results

Written by: Researcher (via search_knowledge tool)
Read by: ResearchResultWidget

```json
{
  "query": "machine learning basics",
  "results": [
    {
      "title": "Neural Networks",
      "content": "Neural networks are...",
      "category": "ai",
      "relevance": 0.95
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Adding New Box Schemas

1. Define the schema here first (this is the contract)
2. Implement the tool that writes the data (backend)
3. Create the widget that reads the data (frontend)
4. Both sides MUST match this schema exactly
