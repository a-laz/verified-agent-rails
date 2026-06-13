# Demo Script

_Verified Agent Rails (VAR) — the beat-by-beat live demo. This is the thing that gets judged._

---

## 1. Narrative Arc

An autonomous agent tries to buy a service and **gets rejected** — it carries no **Agent Passport**, so the gated token's pre-transfer check refuses to move funds and returns a machine-readable revert reason. A human steps in, proves they are a unique person **once** with World ID, and **delegates** to the agent: signing an on-chain **Mandate** that scopes a spend cap, an asset whitelist, and an expiry into a passport. The agent retries, the same view call now clears, and it **pays in USDC on Arc**, then sweeps idle balance into a yield instrument the mandate permits. Then the kill shot: the human **revokes** from the UI, and on the agent's very next attempt it is instantly locked out — accountability with one click, enforced by the money itself, with zero new trust assumptions.

---

## 2. Beat Table

Each beat: what the presenter does, what's on screen, what happens on-chain, and the line to say. Keep the whole run under ~4 minutes.

| # | Presenter does | On screen | On-chain | Line to say |
|---|----------------|-----------|----------|-------------|
| 0 | Set the stage. One sentence, no jargon. | VAR dashboard: left = grant/revoke panel (empty, "No active mandate"), right = live agent status + box widgets. | Nothing yet. | "This is an AI agent with its own wallet. I'm going to let it spend my money — but only on a leash. Watch." |
| 1 | Trigger the agent's first purchase attempt (button in agent panel, or it auto-runs its loop). | Agent log: `check-eligibility → pay`. Status flips to **REJECTED**. A revert card appears. | Token transfer calls `canTransfer(from, to, amount)` (ERC-7943) → `isActiveForAmount(agentId, principal, amount)` (ERC-8226) → **AgentBook** lookup. No passport found → transfer reverts. | "It tries to pay. No passport, no permission — so the token itself refuses." |
| 2 | Point at the **machine-readable revert reason**. | Revert card shows an ERC-1404-style restriction code + human string (`code 1: NO_PASSPORT` — "Sender carries no Agent Passport", per `03_CONTRACTS.md` §4). ⚠️ verify exact code/string values against the contract. | The revert reason is surfaced through the 7943 / 8226 revert path — detectTransferRestriction / messageForTransferRestriction style. | "This isn't a generic failure. The chain tells you exactly why: no active mandate. That's a code an agent can read and act on." |
| 3 | Switch to the human side. Click **Verify with World ID**. | IDKit modal opens (World App / Orb credential). On success, panel shows "Human verified." | `IWorldID.verifyProof(root, groupId, signalHash, nullifierHash, externalNullifierHash, proof[8])` with `groupId = 1` (Orb). `signal` binds the proof to the agent wallet. AgentBook is seeded/anchored from this proof-of-human. | "First I prove I'm a real, unique person — once. Privacy-preserving: no name, no email, just a proof." |
| 4 | **Delegate**: set the Mandate — spend **cap**, asset **whitelist**, **expiry** — and sign. | Grant panel: cap field (e.g. 50 USDC), whitelist (the gated token + the yield instrument), expiry (e.g. 1 hour). Click **Grant**. Panel flips to "Mandate active." | `grantMandate(...)` (ERC-8226) writes the scoped delegation; the **Agent Passport** is now resolvable via AgentBook. ⚠️ verify exact `grantMandate` params against the contract — not fully specified in the bundle. | "Now the leash: spend up to this much, only these assets, until this time. I sign it. That's the passport." |
| 5 | Retry the purchase. | Agent log re-runs `check-eligibility → pay`. Status flips to **CLEARED**. | Same chain as beat 1 — token → 7943 `canTransfer` → 8226 `isActiveForAmount` → AgentBook — but now the mandate is active and the amount is within the cap, so the view call returns `true`. **Hot path: one on-chain view call. No paymaster, no relayer, no off-chain attestation.** | "Same check as before. This time it clears — because the mandate is live and the amount's under the cap." |
| 6 | Let it pay. | Payment widget: amount + tx confirmation. Agent status: "Paid." | Agent's Dynamic-provisioned wallet signs and broadcasts the USDC transfer on **Arc**. Settlement in stablecoins (USDC). Arc uses USDC as the native gas token (~$0.01/tx). | "It pays for the service. Real USDC, on Arc, settled on-chain. No card, no human in the loop." |
| 7 | Sweep idle funds to yield. | Yield widget updates: idle balance → yield instrument; running balance shown. | Agent moves idle USDC into the yield instrument **the mandate's whitelist permits**. The same `canTransfer` gate applies — a non-whitelisted asset would revert. | "Idle money shouldn't sit still. It sweeps the rest into a yield instrument — but only one I whitelisted. Anything else would bounce." |
| 8 | **THE KILL SHOT.** Click **Revoke**. | Grant panel: big **Revoke** button. One click → "Mandate revoked." | `revokeMandate(...)` (ERC-8226) terminates the mandate on-chain. ⚠️ verify exact `revokeMandate` params against the contract. | "Now the part that matters. I yank the leash — one click, from here." |
| 9 | Trigger one more agent attempt. | Agent log: `check-eligibility → pay` → **REJECTED** again, same machine-readable revert reason path. | Next transfer hits 7943 → 8226 → AgentBook; mandate is gone → `isActiveForAmount` returns `false` → revert. **Next block, the agent is dead.** No kill switch was shipped in the agent's code. | "Next block, it's locked out. I didn't deploy a kill switch — the asset enforces it. Accountability with one click." |

---

## 3. Screen / Setup Checklist

Have all of this green **before** you present. Pre-flight the full run once.

- [ ] **Frontend up**: `cd frontend && npm run dev` — VAR dashboard on `:3000`, grant/revoke panel + agent status widgets rendering.
- [ ] **Backend up**: `cd backend && uvicorn src.main:app --reload --port 8000` — agent loop (check-eligibility / pay / park-yield) reachable; box polling (`GET /api/box/Orchestrator`, every 2s) feeding the widgets.
- [ ] **Contracts deployed on Arc testnet** (Chain ID `5042002`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`): passport/Mandate contract (ERC-8226), eligibility resolver / AgentBook, demo gated token (ERC-7943), yield instrument. Note addresses on a cheat card.
- [ ] **Agent wallet provisioned via Dynamic** and funded: test USDC from `https://faucet.circle.com`. Confirm the wallet can sign (Dynamic delegation credentials present). ⚠️ MPC signing can add seconds of latency — pre-warm before the demo.
- [ ] **World ID ready**: IDKit configured with `app_id` + `action`; `signal` = agent wallet address; `groupId = 1` (Orb). Have a working Orb-verified World App account on the demo phone. ⚠️ AgentKit/AgentBook registration requires a prior Orb visit.
- [ ] **State reset to clean**: no active mandate, agent balance funded, revert card cleared. The demo must start from "REJECTED."
- [ ] **Block explorer tab open** (Arc testnet arcscan) to show real txs if a judge asks "is this actually on-chain?"
- [ ] **Two monitors / mirrored screen**: presenter notes off-screen; dashboard + IDKit modal on the shared screen. Test that the IDKit modal renders on the projector.
- [ ] **Network**: phone + laptop on a known-good connection; have a hotspot fallback (World ID + RPC both need network).
- [ ] **Timing dry-run**: full run end-to-end ≤ 4 min, including the deliberate pause on the kill shot.

---

## 4. Fallback Plan (if a live integration flakes)

Live blockchain + biometrics + MPC over conference wifi is the riskiest possible demo surface. Decide per-segment in advance whether it's live or pre-recorded, and rehearse the swap so it's invisible.

**Risk-ranked, and what's safe to mock:**

| Segment | Live-demo risk | Fallback (safe to mock) |
|---------|----------------|-------------------------|
| **The on-chain gate** (7943 → 8226 → AgentBook revert/clear) | This is the whole thesis — keep live if at all possible. | If RPC is down: switch to a **pre-recorded screen capture** of the exact revert → grant → clear → revoke sequence. Narrate over it live. Do **not** fake the revert reason — show the real recorded one. |
| **World ID verify** (Orb / IDKit modal) | Medium — depends on World App, phone camera, network, root propagation. | Pre-record the IDKit success, or use a **pre-verified nullifier** already seeded into AgentBook so you skip the live modal. State plainly that verification was done beforehand. ⚠️ never claim a mock proof is a live one. |
| **Dynamic wallet signing** (MPC) | Medium — TSS-MPC round-trip latency; closed-alpha surface. | Pre-sign / pre-broadcast the payment tx and replay the confirmation in the UI. The compliance gate is the star; the signing mechanism can be stubbed. |
| **USDC payment + yield sweep on Arc** | Low–medium — Arc testnet is experimental. | If a tx hangs, cut to a **recorded tx confirmation** + the explorer page. Keep the explorer screenshot on the cheat card. |
| **Frontend dashboard / box widgets** | Low — local, no external deps. | Keep live. If the backend stalls, hardcode the box payloads so widgets still render the narrative states. |
| **TEE attestation (stretch)** | High / not core. | Leave out of the main run entirely. Mention as a one-line "next step," show a static badge only if it's solid. |

**Golden rule:** the **revert reason**, the **grant→clear transition**, and the **revoke→locked-out** beat must be shown truthfully (live or honestly-labeled recording). Everything around them — wallet signing, the World App modal animation, the payment confirmation — is safe to pre-record or stub, as long as you say so if asked.

**Hard cutover trigger:** if any live step doesn't resolve within ~10 seconds on stage, say "let me show you the recorded run" and switch. Don't debug live.

---

## 5. Close On This

> "The human proves they're real once, hands the agent a scoped leash, and the money itself enforces it — eligible transfers clear, everything else reverts, and one click locks the agent out by the next block. Zero new trust assumptions."
