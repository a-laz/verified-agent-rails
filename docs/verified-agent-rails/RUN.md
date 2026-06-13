# VAR — Local Run Guide

End-to-end local run of **Verified Agent Rails (VAR)**: an autonomous agent
with a scoped, on-chain mandate, where the money itself enforces the leash. This
guide takes you from a cold repo to the full demo arc:

> **reject → grant → clear → pay → park-yield → revoke → locked-out**

running on a local Hardhat node (chain `31337`).

---

## Prerequisites (already installed in this environment)

- **Node 22** and npm
- **Python 3.13** with the project venv at `.venv/` and the backend
  requirements installed (`web3`, `eth-account`, `fastapi`, `uvicorn`, …)
- **Hardhat 2.28.x** + **OpenZeppelin Contracts 5.6.x** under `contracts/`
  (already `npm install`-ed — `contracts/node_modules` exists)
- **Solidity 0.8.24** (pinned in `contracts/hardhat.config.js`)

No global installs are required. The venv python is at
`.venv/Scripts/python.exe` (Windows).

---

## One-shot: `run-local.ps1`

From the repo root:

```powershell
./run-local.ps1
```

This runs all five steps of the run flow: it launches the hardhat node, the
backend, and the frontend in their own background PowerShell windows, deploys
the contracts in the foreground, then executes the headless demo arc. On
success it prints **`ARC OK`** and leaves the backend (`:8000`) and frontend
(`:3000`) running for the UI demo.

If you'd rather drive each step by hand (recommended the first time, so you can
watch each terminal), follow the manual steps below.

---

## Manual run — the five steps (SPEC §6)

Open a separate terminal for each long-running service. **Order matters**:
node → deploy → backend → frontend → demo.

### 1. Start the Hardhat node (chain 31337)

```powershell
npm --prefix contracts run node
```

**Success looks like:** a list of 20 funded accounts and their private keys,
ending with `Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/`.
Leave this running. Account[0] is OWNER/HUMAN, account[1] is the AGENT,
account[2] is the SERVICE recipient (per SPEC §1).

### 2. Deploy the contracts locally

```powershell
npm --prefix contracts run deploy:local
```

This deploys `AgentBook → EligibilityResolver → GatedToken ("Gated USDC",
gUSDC) → YieldVault`, mints `1,000,000 gUSDC` to the AGENT, and writes the
addresses + ABIs where the backend can load them.

**Success looks like:** printed addresses for all four contracts and a written
`contracts/deployment.json` plus the ABIs / `deployment.json` consumed under
`backend/src/var/`.

### 3. Start the backend (FastAPI, port 8000)

```powershell
cd backend
../.venv/Scripts/python.exe -m uvicorn src.main:app --reload --port 8000
```

**Success looks like:** `Uvicorn running on http://127.0.0.1:8000`. The VAR
router (`/api/var/*`) and the `VAR` agent are registered. Box polling
(`GET /api/box/Orchestrator`, every 2s) feeds the widgets.

### 4. Start the frontend (Next.js, port 3000)

```powershell
npm --prefix frontend run dev
```

**Success looks like:** `ready - started server on http://localhost:3000`. Open
it: the VAR dashboard shows the grant/revoke panel (empty — "No active
mandate") and the agent status + box widgets.

### 5. Run the headless demo arc (the proof)

This is the headless proof the rails work even without the UI.

```powershell
cd backend
../.venv/Scripts/python.exe scripts/demo_arc.py
```

(POSIX shells: `../.venv/bin/python scripts/demo_arc.py`.)

**What it does**, with the binding amounts and restriction codes:

| Step | Action | Expectation |
|------|--------|-------------|
| 1 | `check` 10 gUSDC | REJECT — code **1** (NO_PASSPORT) |
| 2 | `grant` cap 50 gUSDC, expiry 60 min | tx success |
| 3 | `check` 10 gUSDC | CLEAR — code **0** |
| 4 | `pay` 10 gUSDC → SERVICE | tx success |
| 5 | `park` 20 gUSDC → YieldVault | tx success |
| 6 | `revoke` | tx success |
| 7 | `check` 10 gUSDC | REJECT — code **2** (MANDATE_REVOKED) |

**Success looks like:** each step prints its restriction code and tx hash, every
expectation reports `[PASS]`, and the final line is:

```
ARC OK
```

The script **exits non-zero** if any expectation fails (use it in CI / as a
smoke test). A connection error means the hardhat node isn't up or the
contracts aren't deployed — re-check steps 1–2.

### Driving the same arc from the UI

With backend + frontend up, open `http://localhost:3000`:
- The agent's first **Check / Pay** shows **REJECTED** with the machine-readable
  revert reason (code 1).
- Use the grant panel ("Verify with World ID" is a **local stub** that calls
  grant): set cap 50, expiry 60, **Grant** → mandate active.
- **Check / Pay / Park** now clear; the tx feed and balances update.
- **Revoke** → the next **Check** is instantly locked out (code 2).

---

## Local substitutions & swap points (SPEC §0)

Everything below runs locally for the MVP, with a clean seam to the real
sponsor stacks. Nothing here mocks the *enforcement* — the on-chain gate is
real on the local node.

| Real (production) | Local MVP substitute | Swap point |
|---|---|---|
| Arc testnet (chain `5042002`) | Hardhat node (`31337`) | `CHAIN_RPC_URL` env; the deploy script runs against either network (`deploy:local` / `deploy:arc`) |
| TSS-MPC signing | local `eth-account` keys in `chain.py` (the Node sidecar is a parallel artifact) | `chain.py` signer, or the sidecar `POST /sign-transaction` |
| World ID Orb proof | server-side `seed()` call with a deterministic nullifier | `AgentBook.seed(agent, human, nullifierHash)` |
| Real USDC on Arc | `GatedToken` ("Gated USDC", `gUSDC`, 6 decimals) deployed locally | the token address in `deployment.json` |

To point at Arc testnet instead of the local node: set `CHAIN_RPC_URL` (and the
owner/agent keys) in `backend/.env`, then deploy with
`npm --prefix contracts run deploy:arc`. The backend and demo arc read the new
`deployment.json` unchanged.

---

## Troubleshooting

- **`ARC ERRORED — connection refused` / web3 cannot connect:** the hardhat
  node (step 1) isn't running, or `CHAIN_RPC_URL` doesn't point at it
  (default `http://127.0.0.1:8545`).
- **`deployment.json` not found / import error in `demo_arc.py`:** run the
  deploy (step 2) before the demo; it must be re-run after every fresh
  `npm --prefix contracts run node` (a new node has empty state).
- **Backend can't import `src.var.chain`:** run uvicorn and the demo from the
  `backend/` directory so `src.*` resolves.
- **Widgets blank:** confirm the backend is up and box polling is hitting
  `GET /api/box/Orchestrator`; the frontend talks to the backend through the
  existing `/api/proxy/[...path]` route.
