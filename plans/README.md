# Plans

This directory holds phase prompts and progress tracking for multi-session development.

## How It Works

1. **PROGRESS.md** — Single source of truth for "where are we?" Survives context compaction.
2. **Phase directories** — Each major feature gets a directory with a `prompt_for_claude_code.txt`
3. **Contracts** — Data shape agreements live in `contracts/` (root level)

## Creating Phase Prompts

When planning multi-step work:

```
plans/
├── README.md           # This file
├── PROGRESS.md         # Current state (update frequently)
├── 01_new-feature/
│   └── prompt_for_claude_code.txt
├── 02_another-feature/
│   └── prompt_for_claude_code.txt
```

Each prompt file should be self-contained:
- What to build (requirements)
- Which files to create/modify
- How to verify (test commands)
- Dependencies on other phases

## Progress Tracking

Update `PROGRESS.md` after completing major work. Format:

```markdown
## Current State
- Phase 1: COMPLETE
- Phase 2: IN PROGRESS — working on X
- Next: Phase 3

## Recent Changes
- file.py: Added new tool
- widget.tsx: Fixed rendering

## Blockers
- None
```

This ensures continuity across context compactions and between sessions.
