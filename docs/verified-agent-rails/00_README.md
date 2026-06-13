# Verified Agent Rails (VAR) — Docs

_Give an AI agent a leash, not your whole wallet — enforced by the money itself._

A hackathon build that links an autonomous AI agent to an accountable, World-ID-verified human so it can transact in **compliant** finance. The human verifies once, hands the agent a scoped **Mandate** carried by an on-chain **Agent Passport**, and the asset itself refuses to move unless the caller is a verified agent under an unrevoked mandate. Revoke → **next block the agent is dead**. One build, three sponsor tracks (World · Dynamic · Arc/Circle).

---

## Status

| Layer | State |
|-------|-------|
| **Design docs (`01`–`08`)** | ✅ v1 complete — read below |
| **Deep-research dossier (`research/`)** | ✅ complete — 5 rounds, 90 agents, ~5.7M tokens. Start at [`research/00_DOSSIER.md`](research/00_DOSSIER.md) → [`research/DECISIONS.md`](research/DECISIONS.md) → [`research/OPEN_QUESTIONS.md`](research/OPEN_QUESTIONS.md) |
| **Reconciliation** | ✅ done — see [`09_RECONCILIATION.md`](09_RECONCILIATION.md). Two v1 bugs fixed inline: ERC-8226 unverified-as-published, `getActivePrincipal` doesn't exist. |

> The design docs are intentionally honest about what's unverified: anything marked **⚠️ verify** or **TBD — confirm in docs** is a known unknown the overnight research loop is chasing down. `08_RISKS.md` and (when ready) `research/OPEN_QUESTIONS.md` consolidate them.

---

## The one decision to lock first

The hot path must be a **single on-chain VIEW call** (`token → canTransfer → EligibilityResolver → AgentBook`), and a VIEW call can't reach across chains. So **everything co-locates on one chain — Arc (testnet)**: the gated token, the contract stack, and an **AgentBook mirror** that World ID **seeds once, off the hot path**. Lock this before any Solidity is written. Full rationale: `08_RISKS.md` → "The Decision to Lock First".

> 🔴 **Confirm with sponsors FIRST:** does the Circle/Arc bounty accept an Arc-**testnet** demo? Arc **mainnet** doesn't launch until summer 2026. If it requires mainnet, pivot to a **World Chain monolith (Chain ID 480)** on day one — this gate decides which codebase you write. See `09_RECONCILIATION.md` → DECIDE FIRST.

---

## Read in this order

| If you're… | Start with |
|------------|------------|
| **Getting the pitch / why it matters** | `01_VISION.md` |
| **Building the contracts (do this first)** | `03_CONTRACTS.md` → `02_ARCHITECTURE.md` |
| **Wiring a sponsor SDK** | `04_INTEGRATIONS.md` |
| **Running the demo** | `05_DEMO_SCRIPT.md` |
| **Planning the 36 hours / dividing work** | `06_BUILD_PLAN.md` |
| **Prepping for judges** | `07_PRIZES.md` |
| **De-risking before you cut code** | `08_RISKS.md` |

## Full index

| Doc | What's in it |
|-----|--------------|
| [`01_VISION.md`](01_VISION.md) | Problem, thesis, the full pitch library (expense-card + leash framings, 4 engineer one-liners), "why now" |
| [`02_ARCHITECTURE.md`](02_ARCHITECTURE.md) | Four layers, the `7943 → 8226 → AgentBook` composition + flow diagrams, trust model, end-to-end payment + revocation flows |
| [`03_CONTRACTS.md`](03_CONTRACTS.md) | **The keystone.** Mandate struct, GatedToken/Resolver/AgentBook interfaces, ERC-1404-style revert codes, eligibility view pseudocode. Build this first. |
| [`04_INTEGRATIONS.md`](04_INTEGRATIONS.md) | World ID · Dynamic · Arc/Circle — exact SDK/verifier/RPC surfaces + the gotcha per stack |
| [`05_DEMO_SCRIPT.md`](05_DEMO_SCRIPT.md) | Beat-by-beat live demo (reject → verify → grant → pay → yield → **revoke kill-shot**) + flake fallbacks |
| [`06_BUILD_PLAN.md`](06_BUILD_PLAN.md) | Critical path, MVP/CUT/STRETCH ladder, 3-lane parallel workstreams, hour-blocked timeline, definition of done |
| [`07_PRIZES.md`](07_PRIZES.md) | Three-track mapping, per-judge sentences, EIP reference-implementation differentiator, talking points |
| [`08_RISKS.md`](08_RISKS.md) | Risk register (cross-chain = #1), hour-0 open-questions checklist, the chain-topology decision |
| [`09_RECONCILIATION.md`](09_RECONCILIATION.md) | **What the overnight research changed** — corrections, locked decisions (D0–D11), hour-0 open pins |
| `research/` | Deep-research dossier (✅ complete) — `00_DOSSIER.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md` + 14 per-domain files |

---

## Canonical terms (use these exactly)

- **Agent Passport** — the on-chain, signed attestation that an agent acts for a verified human.
- **Mandate** — the scoped permission a passport carries: spend cap, asset whitelist, expiry, revocable at will.
- **AgentBook** — the on-chain registry/mirror that resolves eligibility, seeded/anchored from a World ID proof-of-human.
- **Hot path** — the per-transfer check: one on-chain VIEW call. No paymaster, no relayer, no off-chain attestation.
- **The composition** — `token → ERC-7943 canTransfer (Final) → ERC-8226 isActiveForAmount (Draft) → AgentBook`. Three view functions, one revert path, **zero new trust assumptions**.

## Substrate

VAR reuses this repo's `agent-stack-template`: the Next.js frontend hosts the grant/revoke panel + box-polled status widgets; the FastAPI backend hosts the agent loop (check-eligibility → pay → park-yield). Only the Solidity contracts are net-new. See `../../CLAUDE.md`.
