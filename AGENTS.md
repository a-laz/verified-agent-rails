# AGENTS.md — Agent Topology & Contracts

## Topology

```
User → Orchestrator (Director)
         └── Researcher (Specialist)
```

## Orchestrator

- **Name**: Director
- **Type**: Orchestrator
- **Role**: Coordinates specialists, compiles final response
- **Tools**:
  - `delegate_to_researcher(query)` — sends query to Researcher agent
  - `compile_summary(findings)` — aggregates results into final report
- **Box Keys**:
  - `agents/status` — `{ agents: [{ name, status, lastAction }] }`

## Researcher

- **Name**: Researcher
- **Type**: Researcher
- **Role**: Searches knowledge base, returns structured results
- **Tools**:
  - `search_knowledge(query, category?)` — searches KNOWLEDGE_BASE dict
- **Box Keys**:
  - `research/results` — `{ query, results: [{ title, content, category, relevance }], timestamp }`

## Adding New Agents

See `docs/ADDING_AGENTS.md` for step-by-step instructions.

## Box Key Registry

| Key | Written By | Read By Widget | Schema |
|-----|-----------|----------------|--------|
| `agents/status` | Orchestrator | AgentStatusWidget | See `contracts/box_schemas.md` |
| `research/results` | Researcher | ResearchResultWidget | See `contracts/box_schemas.md` |
