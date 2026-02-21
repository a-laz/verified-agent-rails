# Agent Stack Template

Minimal multi-agent app template for hackathons. Orchestrator + specialist agents with a real-time dashboard powered by Anthropic's Claude API.

## Quick Start

```bash
# 1. Clone
git clone <repo-url> my-project
cd my-project

# 2. Install frontend deps
npm install

# 3. Install backend deps
cd backend && pip install -r requirements.txt && cd ..

# 4. Configure
cp .env.example .env
cp backend/.env.example backend/.env
# Edit backend/.env — add your ANTHROPIC_API_KEY

# 5. Run (two terminals)
cd backend && uvicorn src.main:app --reload --port 8000
cd frontend && npm run dev
```

Open http://localhost:3000 and start chatting.

## What's Included

- **Multi-agent orchestration**: Orchestrator delegates to specialists, aggregates results
- **Tool use**: Agents have registered tools that Claude calls automatically
- **Box/Unbox pattern**: Agents push structured data → widgets render in real-time
- **SSE streaming**: Chat responses stream in real-time via Server-Sent Events
- **Swappable storage**: In-memory (default) or local JSON files
- **Design system**: CSS tokens, glass effects, dark themes
- **Deployment ready**: Vercel (frontend) + Railway (backend) configs included

## Architecture

```
Frontend (Next.js 14)           Backend (FastAPI)
┌─────────────────────┐         ┌──────────────────────┐
│ Dashboard Widgets   │ ←poll── │ Box Storage           │
│ Chat Panel          │ ←SSE──  │ Agent Orchestrator    │
│ Theme System        │         │   └── Researcher      │
└─────────────────────┘         └──────────────────────┘
```

## Extending

| Task | Guide |
|------|-------|
| Add a new agent | `docs/ADDING_AGENTS.md` |
| Add a new widget | `docs/ADDING_WIDGETS.md` |
| Deployment | `.claude/rules/deployment.md` |

## For AI Assistants

This repo includes comprehensive `CLAUDE.md` files and `.claude/rules/` for AI-assisted development. Open with Claude Code and ask "what is this?" to get oriented.

## Deployment

- **Frontend**: Vercel — set Root Directory to `frontend`
- **Backend**: Railway — set Root Directory to `backend`
- See `.claude/rules/deployment.md` for details

## License

MIT
