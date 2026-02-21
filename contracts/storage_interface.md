# Storage Interface Contract

## StorageProvider ABC

```python
from abc import ABC, abstractmethod
from typing import Any, Optional

class StorageProvider(ABC):
    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """Retrieve value by key. Returns None if not found."""
        ...

    @abstractmethod
    async def set(self, key: str, value: Any) -> None:
        """Store value at key."""
        ...

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Remove key. No-op if key doesn't exist."""
        ...

    @abstractmethod
    async def list_keys(self, prefix: str = "") -> list[str]:
        """List all keys matching prefix."""
        ...
```

## Implementations

| Provider | Backend | Persistence | Use Case |
|----------|---------|-------------|----------|
| `InMemoryStorageProvider` | Python dict | None (lost on restart) | Development, testing |
| `LocalStorageProvider` | JSON files in `.agentstack_storage/` | Disk | Local persistence |

## Key Format
- Pattern: `"category/key"` (max 2 levels with `/` separator)
- Examples: `"agents/status"`, `"research/results"`
- Keys must be unique across all agents

## Usage in Agents

```python
# Box (write) — called from tool functions
agent.box("research/results", {"query": "...", "results": [...]})

# Unbox (read)
data = agent.unbox("research/results")
```

## Storage Toggle

Set `STORAGE_BACKEND` environment variable:
- `memory` (default) — InMemoryStorageProvider
- `local` — LocalStorageProvider
