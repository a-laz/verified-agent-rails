# Context Management Rules

## Compaction Resilience
The conversation context may be automatically compacted (summarized) when it
gets too long. To survive compaction:

1. **plans/PROGRESS.md** — Always update after completing major work. This is
   the single source of truth for "where are we?" after compaction.
2. **CLAUDE.md** — Architecture, rules, and key references. Always loaded.
3. **contracts/** — Data shape contracts. Never lose these.
4. **AGENTS.md** — Agent topology and box keys. Essential reference.

## Progress File Pattern
```markdown
# Progress

## Current State
- Phase X: COMPLETE
- Phase Y: IN PROGRESS — working on Z
- Next: Phase W

## Recent Changes
- file1.py: Added tool X
- file2.tsx: Fixed widget rendering

## Blockers
- None / describe any issues
```

## Phase Prompt Pattern
For multi-step projects, create structured prompts:
```
plans/
├── README.md              # Overview of all phases
├── PROGRESS.md            # Current state (updated frequently)
├── 01_setup/
│   └── prompt_for_claude_code.txt
├── 02_backend/
│   └── prompt_for_claude_code.txt
└── 03_frontend/
    └── prompt_for_claude_code.txt
```

Each prompt file should be self-contained:
- What to build (requirements)
- Which files to create/modify
- How to verify (test commands)
- Dependencies on other phases

## Post-Compaction Instructions
Add this to MEMORY.md or CLAUDE.md:
```
## Post-Compaction Instructions
If context was compacted: read `plans/PROGRESS.md` and `CLAUDE.md` first.
Next action: [describe what to do next]
```

## Contracts as Source of Truth
- `contracts/box_schemas.md` — widget data shapes
- `contracts/sse_events.md` — streaming event format
- `contracts/storage_interface.md` — StorageProvider ABC
- `contracts/agent_constructor.md` — Agent factory pattern

When in doubt about a data format, read the contract file. Never guess.
