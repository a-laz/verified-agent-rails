# SSE Events Contract

## StreamChunk Types

The backend yields `StreamChunk` objects, serialized as SSE events.

```python
@dataclass
class StreamChunk:
    type: str       # "text" | "tool_start" | "tool_result" | "done" | "error"
    content: str    # The payload
```

## SSE Wire Format

```
data: {"type": "text", "content": "Here is my analysis..."}

data: {"type": "tool_start", "content": "search_knowledge"}

data: {"type": "tool_result", "content": "{\"query\": \"...\", \"results\": [...]}"}

data: {"type": "text", "content": "Based on the research..."}

data: {"type": "done", "content": ""}

```

Each event is a single `data:` line followed by a blank line.

## Event Types

| Type | Content | When |
|------|---------|------|
| `text` | Partial text from Claude | During generation |
| `tool_start` | Tool name | When Claude invokes a tool |
| `tool_result` | JSON string of tool output | After tool execution |
| `done` | Empty string | Stream complete |
| `error` | Error message | On failure |

## Frontend Consumption

```typescript
// POST fetch + ReadableStream (NOT EventSource which is GET-only)
const response = await fetch("/api/chat/stream", {
  method: "POST",
  body: JSON.stringify({ message, history }),
});
const reader = response.body.getReader();
// Parse SSE lines from chunks
```

## Rules
- Always end stream with a `done` or `error` event
- `tool_result` content is always a JSON string
- Text events may contain partial words (buffer for display)
