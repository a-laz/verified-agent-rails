# Verified Agent Rails — Executive Dossier
*One verified human, one accountable agent, one on-chain VIEW call between an autonomous wallet and compliant finance.*

> **Feasibility verdict: BUILD — GO (with one DECIDE-FIRST gate).** The core thesis is sound and every foundation layer is live or Final: ERC-7943 `canTransfer` (Final), World ID proof-of-human (live), Dynamic agent wallets (production), Arc testnet (live, Chain ID `5042002`), USDC + x402 (production). The hot path collapses to a single on-chain VIEW call with atomic next-block revocation. **The build is unblocked the moment three interface values and one chain-topology question are locked at hour 0.** Two load-bearing corrections must propagate to all lanes before Solidity is written: **(1) ERC-8226 does not exist as a public standard — VAR ships a custom `EligibilityResolver`, not an interface to a spec; (2) `getActivePrincipal` does NOT exist in ERC-8004 — use `getAgentWallet(agentId)` + local resolution.**

---

## 1. Feasibility Heat-Map

| Domain | Verdict | One-line why | File |
|---|---|---|---|
| ERC-7943 (gated token) | **YES** | `canTransfer(from,to,amount)→bool` is Final; the token→resolver→AgentBook composition is a pure VIEW chain. | [./eip7943.md](./eip7943.md) |
| ERC-8226 (mandate resolver) | **YES (as custom)** | Standard does **not** exist publicly ⚠️ — but VAR's own `EligibilityResolver.isActiveForAmount` covers it cleanly. Not a blocker; a relabel. | [./eip8226.md](./eip8226.md) |
| ERC-8004 (agent identity) | **PARTIAL** | Identity registry is live (Jan 2026); but `getActivePrincipal` is fictional ⚠️ — VAR must resolve principal locally. | [./eip8004.md](./eip8004.md) |
| World ID (proof-of-human) | **YES** | `verifyProof` is a stateless VIEW; nullifier tracking is app-level (mandatory `usedNullifiers` mapping). $15K bounty confirmed real. | [./worldid.md](./worldid.md) |
| Dynamic (agent wallet + signing) | **PARTIAL** | TSS-MPC provisioning works on Arc testnet; **no Python SDK** ⚠️ — needs Node sidecar; 5–10s MPC signing latency (off hot-path). | [./dynamic.md](./dynamic.md) |
| Arc / Circle (settlement) | **YES** | Testnet live: USDC `0x3600…0000`, gas-in-USDC, sub-second finality. Mainnet not until summer 2026 ⚠️. | [./arc.md](./arc.md) |
| AA / delegation (Mandate impl) | **PARTIAL** | Bespoke on-chain Mandate struct (not ERC-7710/7579) is the right call; blocked on EIP-712-vs-EIP-191 signing question. | [./aa_delegation.md](./aa_delegation.md) |
| RWA compliance (revert codes) | **YES** | ERC-7943 + ERC-1404-style custom error enum is production-feasible; revert lives in `_update`, not the VIEW. | [./rwa_compliance.md](./rwa_compliance.md) |
| Agent payments (x402 / USDC) | **PARTIAL** | x402 production-proven; plain USDC transfer is the MVP-safe path. Gateway custody model for x402 unresolved ⚠️. | [./agent_payments.md](./agent_payments.md) |
| TEE (stretch) | **YES** | Phala Cloud dstack + attestation badge is a ~6–10h stretch; fully cuttable, no hot-path dependency. | [./tee.md](./tee.md) |
| Security | **PARTIAL** | Thesis safe; but signature scheme, `recordExecution` atomicity, and nullifier replay must be designed in, not assumed. | [./security.md](./security.md) |
| Landscape / competition | **YES** | Differentiation is "one-call compliance + instant-revocation UI," not "link agent to human" (World AgentKit owns that now). | [./landscape.md](./landscape.md) |
| Yield (idle funds) | **YES** | 1:1 stub ERC-4626 vault (~100 LOC) beats real USYC (entitlements allowlist, 24–48h Circle request). Cuttable P2. | [./yield.md](./yield.md) |
| Integration / topology | **PARTIAL** | Two viable monoliths (Arc testnet vs World Chain); choice gated on bounty eligibility — see DECIDE-FIRST. | [./integration.md](./integration.md) |

**Legend:** YES = build now · PARTIAL = build with a named workaround/decision · NO = blocked · UNKNOWN = unverified. No domain is NO or UNKNOWN.

---

## 2. Top 8 Decisions the Research Unblocks

| # | Decision | Lock | Confidence | Driving fact |
|---|---|---|---|---|
| 1 | **Chain topology** — Arc testnet monolith vs World Chain monolith | **DECIDE FIRST** (hour 0) | — | Arc mainnet does not exist before the hackathon; viability hinges on whether the Circle/Arc bounty accepts **testnet**. See `OPEN_QUESTIONS.md` top item. |
| 2 | **ERC-8226 → ship a custom `EligibilityResolver`** named explicitly as VAR's own contract | LOCKED | HIGH | ERC-8226 does not exist in public Ethereum repos ⚠️ (9 of 13 domains concur). VAR is the reference impl, not a consumer. |
| 3 | **Mandate = bespoke on-chain struct** (not ERC-7710 / ERC-7579 session keys) | LOCKED | HIGH | One storage write for revoke + synchronous VIEW read = atomic next-block lockout; saves 8–12h vs delegation-manager infra. |
| 4 | **Per-transaction spend caps only** for MVP (no `recordExecution` state write on hot path) | LOCKED | HIGH | Cumulative caps require a state write per transfer, which breaks the "ONE VIEW call" invariant. Cumulative → STRETCH. |
| 5 | **Single hardcoded GatedToken** in the Mandate whitelist; resolver bound to one asset | LOCKED | MEDIUM | Resolves the Pattern-B-vs-single-token signature conflict; simplest path that keeps `isActiveForAmount` spec-shaped. |
| 6 | **AgentBook = Arc-local mirror**, seeded once off-path from a World ID proof | LOCKED | HIGH | Keeps the hot path a single **local** VIEW (no bridge/oracle/relayer); de-risks the #1 cross-chain risk. |
| 7 | **Payment = plain USDC transfer** for MVP; x402 is a stretch | LOCKED | HIGH | Both flow through `canTransfer`, so the hot-path invariant holds either way; plain transfer is explorer-visible and debuggable. |
| 8 | **Yield = 1:1 stub ERC-4626 vault**, share token gated by ERC-7943; cuttable | LOCKED | HIGH | Real USYC has an entitlements allowlist (24–48h Circle request) that can silently brick the agent wallet mid-demo. |

---

## 3. Recommended Chain Topology

**Primary recommendation: Arc-testnet monolith** (the team's current locked plan) — *contingent on the bounty go/no-go (Decision #1)*.

```
                    ┌─────────────────── ARC TESTNET (Chain ID 5042002) ───────────────────┐
                    │   hot path = ONE local VIEW call, no bridge/relayer/paymaster         │
                    │                                                                       │
  agent wallet ───► │  GatedToken (ERC-20 + ERC-7943)                                       │
  (Dynamic TSS-MPC) │     └─ _update() ──► canTransfer(from,to,amount) ──► REVERT on false  │
                    │                          └─► EligibilityResolver.isActiveForAmount(    │
                    │                                   agentId, principal, amount)          │
                    │                                └─► AgentBook (Arc-local mirror)        │
                    │                                       └─ resolveHuman(agentWallet)     │
                    │                                       └─ usedNullifiers[hash] (replay) │
                    │                                       └─ mandate{cap,expiry,revoked}   │
                    │                                                                        │
  USDC 0x3600…0000  │  settlement in native USDC (6-dec ERC-20 iface); gas paid in USDC      │
  yield vault       │  1:1 stub ERC-4626 (idle-funds park; share token ERC-7943-gated)       │
                    └────────────────────────────────────────────────────────────────────────┘
                                            ▲
                                            │ one-time off-path seed (NOT in hot path)
                    ┌───────────────────────┴───────────────────────┐
                    │  World ID verifyProof (proof-of-UNIQUE-human)  │  → seeds AgentBook mirror
                    │  IDKit widget (frontend) + nullifierHash store │     with (nullifier→agent→human)
                    └────────────────────────────────────────────────┘
```

**Why this shape:**
- The eligibility chain bottoms out in an **Arc-local** AgentBook, so `isActiveForAmount` is one synchronous read — no cross-chain hop, no off-chain attestation in the critical path. "Zero new trust assumptions" holds because eligibility traces back to a one-time World ID seed, not a live external oracle.
- **Revocation is a single `mandate.revoked = true` storage flip.** The in-flight race is a non-issue: a transfer landing in block N+1 reads state committed at block N, so it sees `revoked=true` and reverts atomically. This is the "accountability with one click" demo climax.

**Fallback (if Decision #1 forces it): World Chain monolith (Chain ID 480).** Everything on World Chain with native `WorldIDRouter.verifyProof` and native USDC — **95% safe, zero cross-chain risk, shippable today** — but may forfeit the Circle/Arc bounty. Choose this only if the Arc bounty requires mainnet (which does not exist before the event). ⚠️ verify bounty rules hour 0.

---

## 4. The Single Most Important Risk

**Chain-topology / bounty mismatch (existential, hour-0).** VAR's plan is locked to **Arc testnet**, but Arc **mainnet does not launch until summer 2026** — after the hackathon. If the Circle/Arc bounty track requires **mainnet settlement**, the entire Arc-locked architecture is non-viable and the team must pivot to a World Chain monolith on day one. Every contract address, RPC endpoint, and USDC interface differs between the two. **This single unverified fact gates which codebase Lane A writes.** It must be confirmed with sponsors at hour 0 before any deployment target is committed. (See `OPEN_QUESTIONS.md` → DECIDE FIRST.)

*Runner-up:* the chain of self-defined interfaces (ERC-8226 absent, `getActivePrincipal` absent ⚠️) means Lane A is implementing a reference spec, not consuming one — acceptable for a hackathon, but the three open interface signatures (asset-binding, `grantMandate` params, signing scheme) **must be pinned before contract + UI work parallelizes**, or a rewrite waits at hour 28.

---

## 5. Per-Domain Files
- [./eip7943.md](./eip7943.md) — gated token, `canTransfer`, composition chain
- [./eip8226.md](./eip8226.md) — mandate resolver, `isActiveForAmount`, asset-binding
- [./eip8004.md](./eip8004.md) — agent identity, principal resolution, `getAgentWallet`
- [./worldid.md](./worldid.md) — proof-of-human, nullifiers, AgentBook seeding
- [./dynamic.md](./dynamic.md) — agent wallet provisioning, TSS-MPC signing, Node sidecar
- [./arc.md](./arc.md) — Arc testnet, USDC, precompiles, settlement
- [./aa_delegation.md](./aa_delegation.md) — Mandate struct, revoke mechanics, signing scheme
- [./rwa_compliance.md](./rwa_compliance.md) — ERC-1404 revert codes, compliance hooks
- [./agent_payments.md](./agent_payments.md) — x402, EIP-3009, USDC settlement
- [./tee.md](./tee.md) — Phala dstack attestation (stretch)
- [./security.md](./security.md) — threat vectors, signature scheme, replay, atomicity
- [./landscape.md](./landscape.md) — competition, differentiation, bounty targeting
- [./yield.md](./yield.md) — ERC-4626 stub vault, idle-funds park
- [./integration.md](./integration.md) — chain topology trade-offs, bounty eligibility

---
*Sources: cross-domain research compact (13 domains) + still-open-questions loop (12 items). Confidence and ⚠️ verify markers carried forward from per-domain findings. No addresses, signatures, or APIs are invented here — any unverified value is marked ⚠️ or "TBD" in the per-domain files.*
