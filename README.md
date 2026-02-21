# Agent Stack Template

Minimal multi-agent app template for hackathons. Orchestrator + specialist agents with a real-time dashboard powered by Anthropic's Claude API.

## Quick Start

```bash
# 1. Clone
git clone <repo-url> my-project
cd my-project

# 2. Automated setup (installs deps, creates .env, prompts for API key)
./scripts/setup.sh

# 3. Run (two terminals)
cd backend && source venv/bin/activate && uvicorn src.main:app --reload --port 8000
cd frontend && npm run dev
```

Open http://localhost:3000 and start chatting.

### Manual setup (if you prefer)

```bash
npm install
cd backend && pip install -r requirements.txt && cd ..
cp backend/.env.example backend/.env   # add your ANTHROPIC_API_KEY
cp frontend/.env.example frontend/.env.local
```

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

### One-command deploy

```bash
# Prerequisites: gh, vercel, railway CLIs installed and logged in
./scripts/deploy.sh
```

This will:
1. Create a GitHub repo and push your code
2. Deploy the backend to Railway (sets API key, storage config)
3. Deploy the frontend to Vercel (sets backend URL)
4. Cross-link the URLs (CORS on Railway, API URL on Vercel)
5. Print the live URLs

### Manual deploy

- **Frontend**: Vercel — set Root Directory to `frontend`, env var `NEXT_PUBLIC_API_URL`
- **Backend**: Railway — set Root Directory to `backend`, env vars `ANTHROPIC_API_KEY`, `FRONTEND_URL`
- See `.claude/rules/deployment.md` for gotchas

## License

MIT
