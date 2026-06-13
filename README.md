# Verified Agent Rails (VAR)

**Give an AI agent a leash, not your whole wallet — enforced by the money itself.**

An autonomous AI agent can't touch compliant finance because nothing links it to an accountable human. VAR fixes that end-to-end: a human verifies once with **World ID**, grants the agent a scoped, on-chain **mandate** (spend cap · expiry · revocable), and a compliant token **refuses to move unless the agent holds a valid mandate**. Revoke, and by the next block the agent is locked out — accountability with one click.

> Built for ETHGlobal — one build, three sponsor tracks (**World** proof-of-human · **Dynamic** agent wallet · **Arc/Circle** stablecoin settlement). Runs **fully end-to-end locally** on a Hardhat chain, with clean swap-points for the real sponsor stacks.

| | |
|---|---|
| 🟢 **Dashboard** | Judge-ready — **8.64/10** clarity, 5-round usability research, unanimous "ship" |
| 🟢 **Contracts** | **8/8 Hardhat tests pass** — the reject→grant→clear→over-cap→revoke arc proven on-chain |
| 🟢 **End-to-end** | Headless `demo_arc.py` prints `ARC OK`; live stack at `http://localhost:3000` |

---

## The demo arc (what a judge sees)

The dashboard auto-lands on the live **REJECTED** state, then you walk it:

```
①  Agent tries to pay        → ⛔ REJECTED — no mandate, the token refuses
②  Human grants the leash    → ✓  CLEARED — mandate verified on-chain (cap · expiry)
③  Agent pays a service      → ✓  PAID — settled in stablecoin, on-leash
    Agent tries to overspend  → 🛑 BLOCKED — exceeds the spend cap (the leash holds)
④  Agent parks idle funds    → ✓  PARKED — swept to yield, still on-leash
⑤  Human clicks Revoke       → 🔒 REVOKED — locked out next block
```

The whole compliance decision is a **single on-chain VIEW call** on the hot path — no paymaster, no relayer, no off-chain attestation.

---

## Quickstart

Everything is pre-installed (a Python `.venv` and all `node_modules` already exist). From the repo root:

**One-shot (Windows PowerShell):**
```powershell
./run-local.ps1        # starts chain + deploy + backend + frontend, then opens the demo
```

**Or manually, four terminals:**
```powershell
# 1) Local EVM chain (Hardhat, chainId 31337, :8545)
npm --prefix contracts run node

# 2) Deploy the VAR contracts (writes addresses + ABIs into the backend)
npm --prefix contracts run deploy:local

# 3) Backend API (FastAPI, :8000) — run from backend/
cd backend; ..\.venv\Scripts\python.exe -m uvicorn src.main:app --reload --port 8000

# 4) Dashboard (Next.js, :3000)
npm --prefix frontend run dev
```

Then open **http://localhost:3000**. Click **Grant the leash**, then **Pay**; try paying `999` to watch the cap block it; then **Revoke** for the kill-shot.

**Headless proof (no browser needed):**
```powershell
cd backend; ..\.venv\Scripts\python.exe scripts\demo_arc.py   # walks the full arc → "ARC OK"
```

**Re-run the contract tests:**
```powershell
npm --prefix contracts test     # 8 passing
```

> POSIX note: use `.venv/bin/python` instead of `.venv\Scripts\python.exe`. If `:3000` is taken, Next falls back to `:3001`.

---

## Architecture

```
Browser (Next.js :3000)
  └─ /api/proxy/* ─► FastAPI (:8000) ─► web3.py / eth-account ─► Hardhat chain (:8545)
       widgets poll GET /api/box/Orchestrator every 2s          └─ VAR contracts

   the gated transfer, one VIEW call:
     GatedToken.canTransfer(from,to,amt)        [ERC-7943]
        └─► EligibilityResolver.restrictionCode(...) / isActiveForAmount(...)   [VAR's own resolver]
               └─► AgentBook.resolveHuman(agent)     [seeded once from a World ID proof]
        ↳ on failure the revert fires in the token's _update hook with a machine-readable code (0–6)
```

The asset is the enforcement point. The agent's code ships **no kill switch** — revoke flips one storage slot the hot path already reads, so the next block every transfer reverts.

### Stack

| Layer | Tech |
|---|---|
| Contracts | Solidity 0.8.24 · OpenZeppelin 5 · Hardhat |
| Backend | FastAPI · web3.py 7 · eth-account (local signing) |
| Frontend | Next.js 14 · box-polling dashboard (reuses the agent-stack-template substrate) |
| Signing seam | Node sidecar (`/sign-transaction`) — Dynamic TSS-MPC with a local-key fallback |

---

## The contracts

| Contract | Role |
|---|---|
| **GatedToken** (`gUSDC`, 6-dec) | ERC-20 whose every transfer routes through the **ERC-7943 `canTransfer`** gate; revert in `_update`, with `detectTransferRestriction`/`messageForTransferRestriction` views |
| **EligibilityResolver** | VAR's own mandate resolver — `restrictionCode(agent, asset, amount)`, `grantMandate` / `revokeMandate`, and an ERC-8226-shaped `isActiveForAmount` wrapper |
| **AgentBook** | On-chain registry anchoring an agent wallet to one verified human — `seed(agent, human, nullifier)` (World-ID-seeded), `resolveHuman(agent)`, with nullifier replay-guard |
| **YieldVault** | 1:1 ERC-4626 stub for the "park idle funds, on-leash" leg |

**Machine-readable restriction codes** (ERC-1404-style):

| 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| allowed | no passport | mandate revoked | expired | over spend cap | asset not whitelisted | not a verified human |

`npm --prefix contracts run deploy:local` writes `contracts/deployment.json` + `backend/src/var/deployment.json` + `backend/src/var/abis/*.json`. Deploy to Arc testnet (`5042002`) with `deploy:arc` (set `ARC_DEPLOYER_KEY`).

---

## Backend surface

**Routes** (`/api/var/*`): `grant {spendCap, expiryMinutes}` · `revoke` · `pay {amount}` · `park {amount}` · `check {amount}` · `GET state`.

**Box keys** the dashboard reads (merged into `GET /api/box/Orchestrator`): `var/status` · `var/mandate` · `var/balances` · `var/tx_feed`.

**Account map** (Hardhat keys, local only): **owner/human** = `accounts[0]` (grants/revokes), **agent** = `accounts[1]` (pays/parks), **service** = `accounts[2]` (recipient).

---

## Real vs. local (honest scope)

The contract logic, the gating thesis, the agent loop, and the dashboard are all real and working. Three external pieces use documented local stand-ins so it runs without sponsor accounts:

| Production | Local substitute | Swap point |
|---|---|---|
| Arc testnet (`5042002`) | Hardhat (`31337`) | `deploy:arc` / `CHAIN_RPC_URL` |
| Dynamic TSS-MPC signing | local `eth-account` keys | `sidecar/server.js` `/sign-transaction` |
| World ID Orb proof | `AgentBook.seed()` with a deterministic nullifier | swap to on-chain `verifyProof` |

---

## Docs

Deep design + research lives in [`docs/verified-agent-rails/`](docs/verified-agent-rails/):

| Doc | What's in it |
|---|---|
| [`00_README.md`](docs/verified-agent-rails/00_README.md) | Docs index + the one decision to lock first |
| [`01_VISION`](docs/verified-agent-rails/01_VISION.md) · [`07_PRIZES`](docs/verified-agent-rails/07_PRIZES.md) | Pitch library + three-track prize strategy |
| [`02_ARCHITECTURE`](docs/verified-agent-rails/02_ARCHITECTURE.md) · [`03_CONTRACTS`](docs/verified-agent-rails/03_CONTRACTS.md) | System design + the keystone contracts |
| [`SPEC_MVP.md`](docs/verified-agent-rails/SPEC_MVP.md) | The locked build spec everything codes against |
| [`05_DEMO_SCRIPT`](docs/verified-agent-rails/05_DEMO_SCRIPT.md) · [`RUN.md`](docs/verified-agent-rails/RUN.md) | Beat-by-beat demo + run guide |
| [`09_RECONCILIATION.md`](docs/verified-agent-rails/09_RECONCILIATION.md) | What the overnight research corrected (e.g. ERC-8226 isn't a real EIP; `getActivePrincipal` doesn't exist) |
| [`UX_REPORT.md`](docs/verified-agent-rails/UX_REPORT.md) | The 5-round usability study (3.4 → 8.64); screenshots in `uxtest/shots_r1..r5/` |
| [`research/`](docs/verified-agent-rails/research/) | 14-domain deep-research dossier + locked decisions + open questions |

---

## Project layout

```
contracts/   AgentBook · EligibilityResolver · GatedToken · YieldVault + Hardhat tests + deploy
backend/     src/var/chain.py (web3) · src/routers/var.py · src/agents/var_agent.py · scripts/demo_arc.py
frontend/    src/agents/VAR/ — VarDashboard + Hero/StatusBanner/StepTracker/VarCard + 4 widgets
sidecar/     Dynamic MPC signer (/sign-transaction) with local fallback  (:8787, optional)
uxtest/      Playwright screenshot harness + per-round shots
docs/        verified-agent-rails/ — design, spec, research, UX report
```

---

_Built on the **agent-stack-template** multi-agent boilerplate (FastAPI + Next.js box-polling dashboard); the VAR contracts, agent loop, and dashboard are net-new. Deployment notes for the underlying template live in `.claude/rules/deployment.md`._

## License

MIT
