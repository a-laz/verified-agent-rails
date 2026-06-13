# Progress

## Current State
- Template: COMPLETE
- **Verified Agent Rails (VAR) MVP: BUILT & VERIFIED END-TO-END (local)** — 2026-06-13

## VAR Build — verified green
- Contracts (Hardhat): compile clean; **8/8 tests pass** (reject→grant→clear→pay→over-cap→wrong-asset→park→revoke→expiry→anchor→replay→wrapper)
- Local chain: Hardhat node + `deploy:local` (ABIs+addresses written to `backend/src/var/`)
- Backend: `demo_arc.py` prints **ARC OK** (full arc through `chain.py`/web3 on the live chain)
- Backend HTTP: FastAPI boots; `/api/var/*` works; VAR box keys merge into `/api/box/*`
- Frontend: `next build` clean; 4 VAR widgets + manifest wired; live full chain via proxy verified
- Running services (this session): Hardhat node :8545 · FastAPI :8000 · Next dev **:3000**

## VAR Dashboard UX — judge-ready (8.64/10), 2026-06-13
- Iterative usability research: sub-agent panels (5 expert lenses **seeing** 2x Playwright screenshots) + synthesis, 5 rounds.
- Clarity trajectory **3.4 → 6.44 → 7.82 → 7.16 → 8.64**; final panel unanimously **SHIP**, zero high-severity blockers.
- Narrative dashboard: hero pitch · reactive status banners · "Walk the arc" step tracker · state-colored Leash card · over-cap BLOCKED proof · distinct revoke kill-shot · plain-English + on-chain credibility chips.
- Report `docs/verified-agent-rails/UX_REPORT.md` · harness `uxtest/shoot.js` · screenshots `uxtest/shots_r1..r5/`.

## VAR layout
- `contracts/` — AgentBook, EligibilityResolver, GatedToken (ERC-7943), YieldVault + tests + deploy
- `backend/src/var/` (chain.py), `backend/src/agents/var_agent.py`, `backend/src/routers/var.py`, `backend/scripts/demo_arc.py`
- `frontend/src/agents/VAR/` (GrantRevokePanel, MandateWidget, AgentStatusWidget, TxFeedWidget, manifest)
- `sidecar/` — Dynamic signer (local-key fallback)
- Docs: `docs/verified-agent-rails/` (00–09 + SPEC_MVP.md + RUN.md + research/)

## Run it
See `docs/verified-agent-rails/RUN.md` or `run-local.ps1`. Quick: hardhat node → `deploy:local` → uvicorn (venv) → `npm --prefix frontend run dev` → open the dashboard (`:3000`/`:3001`). Headless proof: `cd backend && ../.venv/Scripts/python.exe scripts/demo_arc.py` → "ARC OK".

## Next Steps (real sponsor swap-ins — see SPEC_MVP §0 + 09_RECONCILIATION)
1. Confirm Arc-testnet bounty eligibility (DECIDE-FIRST); deploy `deploy:arc` to chain 5042002.
2. Swap local-key signing → Dynamic MPC via the `sidecar/` (`/sign-transaction`).
3. Swap the `seed()` stub → real World ID `verifyProof` / AgentBook anchoring.
4. Optional: real ERC-4626 yield; TEE attestation badge.
