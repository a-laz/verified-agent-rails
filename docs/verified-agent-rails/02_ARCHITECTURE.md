# Architecture

*Verified Agent Rails (VAR): how a single on-chain view call lets a verified human put an autonomous agent on a revocable leash.*

This doc covers the system architecture: the four layers, the EIP composition chain, the trust model, the end-to-end control flow for one payment, and revocation. Concrete function signatures, addresses, and contract storage layouts are deferred to the contracts doc (`03_CONTRACTS.md`) — this doc references them by name.

> ⚠️ **POST-RESEARCH CORRECTIONS — see `09_RECONCILIATION.md`.** (1) **ERC-8226 is not a verified public standard** — treat the resolver as VAR's own `EligibilityResolver`. (2) **`getActivePrincipal` does not exist in ERC-8004** (only `getAgentWallet(agentId)`); key the Mandate by agent-wallet address and resolve principal locally (fixed below). (3) The hot-path **revert fires in the token's `_update` hook**, not in `canTransfer` (which is a pure VIEW). (4) MVP = **per-transaction spend caps only**.

---

## 1. The Four Layers

VAR is one build that stacks four layers. Each layer maps to a piece of real infrastructure and proves exactly one thing. The composition is what's novel — none of the layers individually is.

| Layer | Step | Tech | What it proves |
|-------|------|------|----------------|
| **1. Credential the human** | Verify once | World ID (Orb / proof-of-human), `IWorldID.verifyProof(...)` | A *unique real human* stands behind everything downstream — privacy-preserving, no PII exposed (only a nullifier + signal). Seeds **AgentBook**. |
| **2. Delegate to the agent** | Provision + sign mandate | Dynamic TSS-MPC agent wallet + the **Agent Passport** attestation | This specific agent wallet *acts on behalf of* that verified human, within a **Mandate** (spend cap, asset whitelist, expiry, revocable at will). |
| **3. Gate the assets** | One view function | Gated token implementing ERC-7943 `canTransfer` → ERC-8226 `isActiveForAmount` → AgentBook | A transfer is *allowed only if* the caller carries a valid, unrevoked passport whose mandate covers this amount/asset. Otherwise it reverts with a machine-readable reason. |
| **4. Transact** | Autonomous loop | Dynamic-signed txns settling in USDC on Arc; idle funds swept to a mandate-permitted yield instrument | The agent can *actually move money* under the leash — pay for a service, park idle balance — and nothing else. |

The **hot path** (the per-transfer check) lives entirely in Layer 3 and is a single on-chain **VIEW** call. Layers 1 and 2 are one-time setup; Layer 4 is the agent loop riding on top.

### Key terms

- **Agent Passport** — the on-chain, signed attestation/mandate that an agent acts for a verified human.
- **Mandate** — the scoped permission carried by a passport: spend cap, asset whitelist, expiry, revocable at will. (ERC-8226 calls this the *agent mandate*.)
- **AgentBook** — the on-chain registry/mirror that resolves eligibility, seeded/anchored by World ID proof-of-human.

---

## 2. The EIP Composition Chain

The thesis to a standards engineer: *"ERC-7943 is Final, ERC-8226 is Draft, ERC-8004 is Draft, and nobody has composed all three against a real proof-of-human. We're the reference implementation."*

### Standards in play

| Standard | Role in VAR | Status |
|----------|-------------|--------|
| **ERC-7943** | Token-level pre-transfer hook. The token calls `canTransfer(...)`. | **Final** |
| **ERC-8226** | Eligibility / mandate resolver. The `canTransfer` implementation calls `isActiveForAmount(...)`. | **Draft** ⚠️ interface may evolve before standardization |
| **ERC-8004** | Agent identity layer (ERC-721 identity registry; resolves agent → principal). | **Draft** ⚠️ deployed to mainnet Jan 2026, early-adoption risk |

### Flow diagram

```
        transfer(to, amount)
   ┌─────────────────────────────┐
   │   Gated Token (ERC-7943)    │
   │                             │
   │   _beforeTransfer hook  ────┼──► canTransfer(from, to, amount)  [VIEW]
   └─────────────────────────────┘                 │
                                                    ▼
                                   ┌────────────────────────────────┐
                                   │   Eligibility Resolver         │
                                   │   (ERC-8226)                   │
                                   │                                │
                                   │   isActiveForAmount(           │
                                   │       agentId, principal, amt) │ [VIEW]
                                   └────────────────────────────────┘
                                                    │
                       resolve agent → principal    │   check mandate active
                       (ERC-8004 Identity Registry) │   + amount within caps
                                                    ▼
                                   ┌────────────────────────────────┐
                                   │   AgentBook                    │
                                   │   (registry/mirror,            │
                                   │    seeded from World ID)       │ [VIEW]
                                   └────────────────────────────────┘
                                                    │
                              true ────────────────►│◄──────────────── false
                          (transfer clears)         │      (revert w/ machine-
                                                    │       readable reason)
```

### Each hop, explained

1. **Token → `canTransfer` (ERC-7943).** Any transfer on the gated token routes through the ERC-7943 pre-transfer hook before state changes. The token does not embed business logic; it asks one question: *is this transfer allowed?* For a fungible (ERC-20-style) token the signature is `canTransfer(address from, address to, uint256 amount)`. (ERC-7943 also defines `canSend`/`canReceive`/`getFrozenTokens`/`forcedTransfer`; VAR's hot path uses `canTransfer`.)

2. **`canTransfer` → `isActiveForAmount` (ERC-8226).** The token's `canTransfer` implementation delegates the *agent-mandate* decision to the ERC-8226 resolver: `isActiveForAmount(uint256 agentId, address principal, uint256 amount) view returns (bool)`. This returns true only if the mandate is **active** and `amount` is **within all defined limits** (per-transaction cap and cumulative usage). This is where the Mandate's spend cap and asset rules are enforced atomically, in-band with the transfer.

3. **Resolve agent → principal (ERC-8004).** ERC-8226 needs to know *which human* this agent acts for. The agent's identity is an ERC-8004 Identity Registry entry (ERC-721; `getAgentWallet(agentId)` / agent-URI metadata). The resolver maps the calling agent wallet to its `agentId` and to the `principal` (the verified human). ⚠️ **Corrected (deep research):** ERC-8004 has **no `getActivePrincipal`** — only `getAgentWallet(agentId) → address`. VAR stores `principal` at grant time, re-resolves `agent → principal` on each check, and reverts on stored-vs-current mismatch (catches wallet rotation); the Mandate is keyed by agent-wallet address. See `09_RECONCILIATION.md`.

4. **Eligibility → AgentBook (seeded from World ID).** Final eligibility resolves against **AgentBook**, the on-chain registry/mirror that links agent wallets to a unique verified human. AgentBook is seeded/anchored by a World ID proof-of-human: a human verifies once with World ID (`IWorldID.verifyProof(root, groupId, signalHash, nullifierHash, externalNullifierHash, proof[8])`), and that proof anchors their AgentBook entry. The `signal` binds the proof to the agent wallet/context; the `nullifierHash` enforces one-human semantics and must be tracked on-chain to prevent reuse.

> **Important nuance from the standards:** presence of an agent in the ERC-8004 Identity Registry is **not** proof of eligibility. ERC-8226 validates that a *mandate* is active and amount-compliant; eligibility (proof-of-human-backed) is resolved separately — here, against AgentBook. The two checks are distinct and both must pass. (ERC-8226 spec delegates KYC/eligibility to a separate compliance provider; in VAR that provider is AgentBook seeded from World ID.)

> ⚠️ verify / scope note: the three EIPs do **not** themselves define a proof-of-human primitive (research bundle, confidence: medium). VAR supplies that layer by seeding AgentBook from World ID. Don't claim the EIPs mandate proof-of-human — they don't; we compose it in.

---

## 3. Trust Model

Tagline: **zero new trust assumptions.** The check that gates money movement is a single on-chain view call. Revoke and **the next block the agent is dead**.

### What's in the hot path

The per-transfer decision is **three view functions, one revert path** (`canTransfer` → `isActiveForAmount` → AgentBook lookup), all executing synchronously inside the transfer transaction. Concretely, the hot path has **no**:

- **paymaster** — not in the transfer-authorization path.
- **relayer** — the agent's own Dynamic-signed transaction carries the call; no meta-tx middleman gates it.
- **off-chain attestation** — no server, oracle, or signed-message round-trip is consulted to decide whether the transfer clears. The mandate and the human-anchor are already on-chain.

To a payments engineer: *"We make the USDC itself refuse to move unless the caller is a verified agent under an unrevoked mandate. The check is a view call. No paymaster, no relayer, no off-chain attestation in the hot path."*

### Why "zero new trust assumptions"

VAR does not introduce a new trusted party. It composes parties the user already trusts or that are already trust-minimized:

| Component | Existing trust assumption (not new) |
|-----------|-------------------------------------|
| World ID | Proof-of-human you'd trust anyway for the "real person" claim; privacy-preserving, no PII. |
| ERC-8004 / 8226 / 7943 | On-chain standards; logic is public and verified on-chain. |
| AgentBook | On-chain registry/mirror; its state is the public source of truth for eligibility. |
| Dynamic TSS-MPC wallet | Holds signing authority for the agent — but it can only sign; the *asset* enforces the mandate, not the wallet. ⚠️ Dynamic TSS-MPC is in closed alpha (research bundle); confirm access for the demo environment. |

The enforcement point is the asset. The agent's code does **not** need a kill switch — *the mandate is enforced by the asset, not by the agent's code.* When the human revokes, the next block's `canTransfer` returns false. You didn't have to ship a kill switch; you composed one out of state.

### What the hot path does NOT prove (be honest)

- It proves **correct code/mandate state**, not correct *intent*. An agent acting within its mandate but for a dumb reason will still clear. The leash bounds blast radius (cap, whitelist, expiry); it does not make the agent smart.
- The TEE stretch goal (verifiable execution) addresses *"did the right agent code run"*, which is orthogonal to *"is the transfer within mandate."* See the stretch section in the pitch/plan doc.

---

## 4. End-to-End Control Flow: One Payment Attempt

A single autonomous payment attempt from the agent. This is the **hot path** — everything here is one transaction plus its in-band view calls.

```
Agent loop (backend)        Gated Token (7943)      Resolver (8226)        ERC-8004 ID Reg    AgentBook
      │                            │                      │                      │                │
      │ 1. build transfer tx       │                      │                      │                │
      │    (USDC on Arc, to=svc)   │                      │                      │                │
      │ 2. Dynamic MPC sign  ──────┼──────────────────────┼──────────────────────┼────────────────┤
      │ 3. broadcast tx ──────────►│                      │                      │                │
      │                            │ 4. _beforeTransfer    │                      │                │
      │                            │    hook fires         │                      │                │
      │                            │ 5. canTransfer(from, │                      │                │
      │                            │    to, amount) [VIEW]│                      │                │
      │                            │──────────────────────►                      │                │
      │                            │                      │ 6. resolve agentId   │                │
      │                            │                      │    + principal ──────►                │
      │                            │                      │◄── getAgentWallet /  │                │
      │                            │                      │    principal         │                │
      │                            │                      │ 7. isActiveForAmount │                │
      │                            │                      │    (active? amount   │                │
      │                            │                      │     within caps?)    │                │
      │                            │                      │ 8. eligibility ──────┼───────────────►│
      │                            │                      │◄── human-anchored?   │   (World-ID-    │
      │                            │                      │    (true/false)      │    seeded)     │
      │                            │◄── allowed (bool) ───│                      │                │
      │                            │ 9a. true → transfer  │                      │                │
      │◄── tx mined, USDC moved ───│      state updates    │                      │                │
      │                            │ 9b. false → REVERT   │                      │                │
      │◄── revert(restriction code,│      machine-readable │                      │                │
      │     human string) ─────────│      reason           │                      │                │
      │                            │                      │                      │                │
      │ 10. (on success) sweep idle USDC → yield instrument the mandate permits   │                │
```

### Step notes

- **Steps 1–3:** The agent (FastAPI backend loop on the agent-stack substrate) decides to pay a service in USDC on Arc, gets the transaction signed by its Dynamic TSS-MPC wallet, and broadcasts. ⚠️ MPC signing involves a server round-trip; expect added latency per signature (research bundle: seconds, not instant). The agent does not pre-flight any off-chain permission check — it just submits; the asset decides.
- **Steps 4–8:** All in-band, all views. The ERC-7943 hook asks `canTransfer`; that asks ERC-8226 `isActiveForAmount`; that resolves the agent→principal via ERC-8004 and checks human-anchored eligibility against AgentBook. (Optional pre-flight: the agent loop MAY call `canTransfer` as a standalone view *before* signing to avoid wasting gas on a known-bad transfer — this is the same call, just read first. The authoritative check is still the in-band one.)
- **Step 9a (clear):** All views return true → the transfer proceeds and USDC moves. ⚠️ verify: if cumulative spend caps are used, ERC-8226 `recordExecution` must be invoked on each agent transfer to keep cumulative usage honest — off-chain or partial recording breaks the guarantee (research bundle gotcha). Confirm whether VAR's mandate uses cumulative caps (which require a state write) vs. per-tx caps only (pure view).
- **Step 9b (reject):** Any view returns false → the transfer reverts with a **machine-readable revert reason**: an ERC-1404-style restriction code plus a human-readable string (`detectTransferRestriction` / `messageForTransferRestriction` style), surfaced through the 7943/8226 revert path. The agent reads the code, surfaces it to the dashboard, and stops. This is the demo's first beat: *agent tries to buy, gets rejected (no passport).*
- **Step 10 (yield sweep):** On success, idle USDC is swept to a yield-bearing instrument the mandate's asset whitelist permits. The sweep is itself a gated transfer — it also passes through `canTransfer`, so the agent can only park funds in instruments the mandate allows.

### Substrate mapping (agent-stack-template)

| VAR piece | Substrate home |
|-----------|----------------|
| Grant/revoke panel + live status | Next.js frontend (delegation UI + box-polled status widgets) |
| Agent loop (check-eligibility → pay → park-yield) | FastAPI backend agent (orchestrator + a payments/agent specialist) |
| Live status updates to dashboard | Box-based real-time dashboard (`GET /api/box/...` polling) |
| Contracts (Passport attestation, gated token, resolver) | **New Solidity** — not part of the template; deployed to Arc testnet |

---

## 5. Revocation Flow

The kill shot: *human revokes, agent is instantly locked out. Accountability with one click.* Mechanically, revoke flips one piece of on-chain state that the hot path already reads — so **the next block the agent is dead**, with no new infrastructure.

```
Human (phone / UI)        Mandate state (8226 / AgentBook)        Next agent transfer attempt
      │                            │                                       │
      │ 1. tap "Revoke" ──────────►│                                       │
      │    (signed tx)             │ 2. revokeMandate(...) / flip          │
      │                            │    AgentBook eligibility → inactive    │
      │◄── 3. revoked (1 tx) ──────│                                       │
      │                            │                                       │ 4. agent broadcasts
      │                            │                                       │    transfer (block N+1)
      │                            │◄── 5. isActiveForAmount → FALSE ──────│
      │                            │                                       │ 6. canTransfer → false
      │                            │                                       │    → REVERT (locked out)
```

### How the flip works

1. **One transaction.** The human (or a delegated operator via ERC-8226 `setOperator`) submits a single signed transaction — `revokeMandate(...)` on the ERC-8226 mandate and/or flipping the agent's AgentBook eligibility to inactive. From the UI this is one tap. ⚠️ verify: exact `revokeMandate(...)` parameters are deferred to `03_CONTRACTS.md` (TBD — confirm in ERC-8226 spec; the research bundle confirms the function exists but not its full signature).
2. **State is the source of truth.** Revocation does not message the agent, ping a relayer, or call the agent's backend. It mutates the same on-chain state that `isActiveForAmount` / AgentBook reads in the hot path.
3. **Next block, the agent is dead.** From the block in which revocation is mined onward, every `canTransfer` the agent triggers resolves `isActiveForAmount → false` (mandate inactive) or AgentBook eligibility → false. The transfer reverts with the machine-readable reason. The agent is locked out without ever being told — *you didn't have to ship a kill switch.*
4. **Expiry is the same mechanism, passive.** A mandate that hits its expiry timestamp flips `isActive → false` automatically — same revert path, no human action needed. Revoke is the manual case; expiry is the time-bounded one.

### Related controls (same state, different lever)

ERC-8226 also exposes `freezeAgent` / `unfreezeAgent` (jurisdiction- or globally-scoped halts) and `extendMandate` (extend validity without resetting cumulative usage). VAR's demo uses **revoke** as the headline; freeze/extend are available knobs on the same on-chain state and ride the same hot-path read.

---

## Cross-references

| Reference | Where |
|-----------|-------|
| Concrete function signatures, addresses, storage layout | `03_CONTRACTS.md` |
| Pitch & canonical messaging | `01_VISION.md` |
| Demo arc (beat-by-beat) | `05_DEMO_SCRIPT.md` |
| Prize coverage | `07_PRIZES.md` |
| Build plan / 36-hour scope / TEE stretch goal | `06_BUILD_PLAN.md` |
| Risks & open questions | `08_RISKS.md` |
| Repo substrate (frontend/backend topology, box dashboard) | `../../CLAUDE.md`, `../../AGENTS.md` |
