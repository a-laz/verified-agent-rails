# Deployment Rules

## Vercel (Frontend)
- Set Root Directory to `frontend` in Vercel project settings
- `vercel.json` in project root handles build config:
  - `installCommand`: `cd .. && npm install` (installs monorepo from root)
  - Framework: Next.js (auto-detected)
- Required env vars: `NEXT_PUBLIC_API_URL` (backend URL)

## Railway (Backend)
- Set Root Directory to `backend`
- `Procfile` defines start command: `uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}`
- Required env vars: `ANTHROPIC_API_KEY`, `FRONTEND_URL` (for CORS)
- Optional: `STORAGE_BACKEND` (memory/local)
- Railway auto-detects Python, installs from requirements.txt

## Proxy Route
- `frontend/src/app/api/proxy/[...path]/route.ts` proxies all `/api/proxy/*` to backend
- This bypasses CORS issues with ngrok, Railway, etc.
- In production, set `NEXT_PUBLIC_API_URL` to backend URL

## Common Issues
- **CORS errors**: Check `FRONTEND_URL` env var on Railway matches your Vercel domain
- **Module not found on Vercel**: Ensure `installCommand` in vercel.json runs from monorepo root
- **Schema paths**: Use relative paths from the running directory, not absolute paths
