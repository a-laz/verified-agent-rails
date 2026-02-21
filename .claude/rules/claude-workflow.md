# Claude Code Workflow Rules

## Session Start Protocol
When starting a new session or after context compaction:
1. Read `plans/PROGRESS.md` for current state
2. Read `CLAUDE.md` for architecture and rules
3. Read `AGENTS.md` for agent contracts
4. Check `plans/` for any pending phase prompts

## Teams & Sub-Agents
- For complex tasks (>3 files, >2 agents), spawn a team with `TeamCreate`
- Use sub-agents for parallelizable work: research, file creation, testing
- Each sub-agent should have a focused task description with all context needed
- Prefer `general-purpose` agents for implementation, `Explore` for research

## Parallel Windows
- Recommend users open a second Claude Code terminal for:
  - Running the dev server while the other implements
  - Audit/testing while the other builds features
  - Independent feature work (different agents, different widgets)
- Coordinate via `plans/PROGRESS.md` — both windows read/write it

## Progress Tracking
- Update `plans/PROGRESS.md` after completing each major task
- Include: what was done, what files changed, what's next
- This file survives context compaction and guides resumed sessions

## Phase Prompt Pattern
- For multi-step projects, create `plans/{phase}/prompt_for_claude_code.txt`
- Each prompt is self-contained: context, requirements, verification steps
- Spawn agents with these prompts for autonomous implementation

## Context Management
- Keep `CLAUDE.md` under 100 lines — reference docs instead of inlining
- Use `contracts/` for data shape definitions (single source of truth)
- Avoid large file reads when possible — use Grep/Glob to find specific code
- When context is getting large, summarize findings before continuing

## Agent Spawning Best Practices
- Always set `mode: "bypassPermissions"` for implementation agents
- Include file paths and exact requirements in the prompt
- Spawn independent agents in parallel (same message, multiple Task calls)
- Check agent output before proceeding to dependent work
