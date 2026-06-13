# Verified Agent Rails — Architectural Decision Locks
*The recommended lock for every major choice, with confidence and the one fact that drives it. Build against these unless DECIDE-FIRST flips topology.*

> **Feasibility verdict: GO.** These are the recommended locks the morning research produces. Each is build-ready except where it depends on the DECIDE-FIRST topology gate (D0) or an hour-0 interface pin (D2, D3). Confidence and ⚠️ verify markers are carried from per-domain findings. No addresses, signatures, or APIs are invented — unverified values are flagged ⚠️ or "TBD."

---

## Decision Summary

| # | Choice | Recommended lock | Confidence |
|---|---|---|---|
| D0 | **Chain topology** | Arc-testnet monolith — *pending bounty go/no-go* | MEDIUM ⚠️ |
| D1 | **Which chain hosts what** | All contracts + settlement on Arc; World ID seeds AgentBook once off-path | HIGH (if D0 = Arc) |
| D2 | **Mandate implementation** | Bespoke on-chain struct + `EligibilityResolver` (not ERC-8226, not ERC-7710/7579) | HIGH |
| D3 | **Mandate signature scheme** | EIP-712 typed data signed by principal; recover on-chain | MEDIUM ⚠️ |
| D4 | **Spend-cap semantics** | Per-transaction caps only (pure VIEW); cumulative → stretch | HIGH |
| D5 | **Payment mechanism** | Plain USDC transfer for MVP; x402 stretch | HIGH |
| D6 | **World ID anchoring** | Arc-local AgentBook mirror, one-time `verifyProof` seed + nullifier track | HIGH |
| D7 | **Yield: real vs stub** | 1:1 stub ERC-4626 vault; share token ERC-7943-gated; cuttable P2 | HIGH |
| D8 | **TEE in/out** | OUT of MVP; Phala dstack attestation badge is a clean stretch | HIGH |
| D9 | **Agent keying** | Key Mandate by agent-wallet address; rotation is a documented limitation | MEDIUM ⚠️ |
| D10 | **Revert codes** | GatedToken owns ERC-1404-style `detectTransferRestriction` + custom error | HIGH |
| D11 | **Backend signing bridge** | Node.js HTTP sidecar wrapping Dynamic SDK, called from FastAPI | HIGH |

---

## D0 — Chain Topology  ·  Confidence: MEDIUM ⚠️
**Lock:** **Arc-testnet monolith** (Chain ID `5042002`) — *contingent on the DECIDE-FIRST bounty check.* If the Circle/Arc bounty requires mainnet, **flip to World Chain monolith** (Chain ID 480).
**Driving fact:** Arc mainnet does not launch until summer 2026 (after the hackathon); Arc testnet is live now with USDC, gas-in-USDC, and sub-second finality. Viability rests entirely on whether the Arc bounty accepts a **testnet** demo — confirm with sponsors hour 0 (see `OPEN_QUESTIONS.md` DECIDE FIRST).
**Why it carries the rest:** Every address, RPC, and USDC interface below assumes Arc. A topology flip rewrites D1/D6/D10 deployment targets.

## D1 — Which Chain Hosts What  ·  Confidence: HIGH (conditional on D0)
**Lock:** All four contracts — `GatedToken`, `EligibilityResolver`, `AgentBook` mirror, stub yield vault — **co-locate on Arc testnet**. World ID proof-of-human is used **once, off the hot path**, to seed the Arc-side AgentBook mirror.
**Driving fact:** Keeping eligibility resolution Arc-local makes the hot path a single **local** VIEW call with no bridge, oracle, or relayer — satisfying the "ONE on-chain VIEW call" invariant and de-risking the #1 cross-chain risk.

## D2 — Mandate Implementation  ·  Confidence: HIGH
**Lock:** A **bespoke on-chain Mandate struct** read by a custom **`EligibilityResolver.isActiveForAmount(...)`** VIEW. **Not** ERC-8226 (does not exist publicly ⚠️), **not** ERC-7710/7715 delegation manager, **not** ERC-7579 session-key modules.
**Driving fact:** A bespoke struct gives one storage write for revoke + a synchronous VIEW read = atomic next-block lockout, with zero off-chain moving parts. Estimated savings: **8–12h** vs ERC-7710 (off-chain delegation storage + redemption) and module init/deinit overhead of ERC-7579. ERC-8226 was searched and not found in public Ethereum repos by 9 of 13 domains — VAR is the reference implementation and must name its contract explicitly for judges.
**Hour-0 dependency:** The asset-binding signature (Pattern B vs single-token) must be pinned before the hot-path body is written — see `OPEN_QUESTIONS.md`. Recommended: `isActiveForAmount(uint256 agentId, address principal, uint256 amount)` bound to one hardcoded GatedToken; asset enforced in `GatedToken.canTransfer`.

## D3 — Mandate Signature Scheme  ·  Confidence: MEDIUM ⚠️
**Lock:** **EIP-712 typed data signed by the principal (human)**, recovered on-chain via `ECDSA.recover`, asserting `signer == principal`. Domain separator: `name='VerifiedAgentRails', version='1', chainId=5042002, verifyingContract=<PassportRegistry>`. Struct hash includes `agentId, principal, identityRef, scopeHash, validFrom, validUntil`.
**Driving fact:** EIP-712 prevents replay across chains and contract upgrades and is the strongest in-contract recovery scheme. **BUT** this is gated by an unconfirmed fact ⚠️: whether Dynamic's `delegatedSignMessage` accepts EIP-712 TypedData or only EIP-191 raw messages. If EIP-191 only, fall back to contract-side EIP-191 ECDSA recovery. Extract from `@dynamic-labs` SDK `.d.ts` hour 0 (this is the single gate). The exact `grantMandate` parameter list must converge from the two circulating candidates before any Solidity finalizes.

## D4 — Spend-Cap Semantics  ·  Confidence: HIGH
**Lock:** **Per-transaction caps only** for MVP. The cap check is a pure VIEW (`amount <= spendCap`); **`recordExecution` is a no-op / omitted**; the `spent` field is removed or always 0. Cumulative caps → STRETCH.
**Driving fact:** Cumulative caps require a **state write on every transfer**, which directly breaks the "ONE VIEW call, zero state changes on hot path" invariant. Harmonize CONTRACTS.md §2 (currently shows cumulative `spent` fields) with BUILD_PLAN.md §2 (per-tx scope) before coding — this contradiction is an integration bug waiting at hour 28.

## D5 — Payment Mechanism  ·  Confidence: HIGH
**Lock:** **Plain USDC transfer** (native ERC-20, 6-decimal interface at `0x3600…0000`) for the MVP "agent pays for service" beat. **x402 is a stretch**, not MVP.
**Driving fact:** Both plain transfer and x402 flow through `canTransfer` on-chain, so the hot-path invariant holds either way — and plain transfer is explorer-visible, has no Circle Gateway dependency, and is simpler to debug. ⚠️ If pursuing x402, first resolve the Gateway custody question (agent self-custodial vs operator-relayed) to avoid silently introducing an off-path trust party that violates "zero new trust."

## D6 — World ID Anchoring  ·  Confidence: HIGH
**Lock:** **Arc-local AgentBook mirror**, seeded **once** via `verifyProof` at registration (off the hot path). Maintain a mandatory `mapping(uint256 nullifierHash => bool) usedNullifiers` for one-time-use replay protection. Hot path does a local `AgentBook.resolveHuman(agentWallet)` read, **not** a live World Chain / cross-chain query.
**Driving fact:** Nullifier tracking is **application-level** — `WorldIDRouter.verifyProof` is stateless and does NOT prevent replay; without the `usedNullifiers` mapping, one human proof can seed multiple agents and break the one-human-one-anchor invariant. AgentBook appears to be a World **service**, not a canonical on-chain contract ⚠️, so VAR is free to define `resolveHuman(address)→address` (confirm from `@worldcoin/agentkit` source). Bind via signal `abi.encodePacked(agent_address).hashToField()`. `externalNullifierHash` recommended: `keccak256(abi.encodePacked('verified-agent-rails-agentbook'))`.
**Open:** `Mandate.identityRef` = raw nullifierHash vs composite `keccak256(nullifierHash, agentWallet)` — affects demo-repeatability across dry-runs; decide before seeding contract.

## D7 — Yield: Real vs Stub  ·  Confidence: HIGH
**Lock:** **1:1 stub ERC-4626 vault** (~100 LOC, all 16 functions, trivial `max*`/`preview*`). Share token implements ERC-7943 `canTransfer`; `Mandate.assetWhitelist` whitelists the **share token only**. The sweep `agent.transfer(vault, idle)` reuses the existing `canTransfer → isActiveForAmount` path — no new hot-path call. **Cuttable P2.**
**Driving fact:** Real Hashnote USYC on Arc testnet has an **entitlements allowlist** that can silently block the agent wallet unless pre-allowlisted via a 24–48h Circle Support request — an unacceptable risk to put on the critical path for a 36h build. The stub eliminates the entitlements gate entirely while preserving the compliance demo.

## D8 — TEE: In vs Out  ·  Confidence: HIGH
**Lock:** **OUT of MVP.** If time allows, Phala Cloud dstack + an attestation **badge widget** (read from box, render quote metadata) is the recommended stretch (~6–10h, ~5min deploy). On-chain attestation anchoring to ERC-8004 Validation Registry is a *further* stretch, not required.
**Driving fact:** TEE has **no hot-path dependency** and the narrative ("verified execution") is satisfiable with a UI badge alone — so it never blocks core demo and is the cleanest thing to cut under time pressure.

## D9 — Agent Keying  ·  Confidence: MEDIUM ⚠️
**Lock:** Key the Mandate by **agent-wallet address**; agent-NFT/wallet rotation requires re-granting the mandate (documented limitation, acceptable for hackathon).
**Driving fact:** `ERC-8004.getActivePrincipal` **does not exist** ⚠️ — only `getAgentWallet(agentId)→address`. VAR's CONTRACTS.md code samples reference the fictional function and will not compile; fix this hour 1. Keying by wallet avoids a dependency on the identity registry for the hot path; keying by `agentId` (survives rotation) is the alternative if rotation must be supported. Always re-resolve and compare stored-vs-current principal to catch rotation, reverting on mismatch.

## D10 — Machine-Readable Revert Codes  ·  Confidence: HIGH
**Lock:** **`GatedToken` owns** `detectTransferRestriction(from,to,amount)→uint8` and `messageForTransferRestriction(uint8)→string`. The revert happens in the state-changing hook (`_update` / `_beforeTokenTransfer`), **not** in the VIEW. Revert via custom error `TransferRestricted(uint8 code, string message)`. Codes (binding): `0=OK, 1=NO_PASSPORT, 2=MANDATE_REVOKED, 3=MANDATE_EXPIRED, 4=OVER_SPEND_CAP, 5=ASSET_NOT_WHITELISTED, 6=NOT_VERIFIED_HUMAN` (extensible, e.g. `7=CALLER_NOT_AGENT`).
**Driving fact:** ERC-7943 `canTransfer` returns `bool` with no code and per spec MUST NOT revert — so the ERC-1404-style code layer is VAR's own, and it must live where the revert actually fires (the token's transfer hook). ⚠️ Confirm ethers.js v6 natively decodes this custom error for Lane C's error UI.

## D11 — Backend Signing Bridge  ·  Confidence: HIGH
**Lock:** A thin **Node.js HTTP sidecar** (Express + Dynamic/Fireblocks SDK) exposing `/sign-transaction`, called over REST from the Python FastAPI agent loop.
**Driving fact:** There is **no Python SDK** for Dynamic agent-wallet signing ⚠️ (Node-only). The HTTP sidecar keeps dependencies clean and testable, survives agent restarts, and reduces the Python↔Node seam to RPC calls. Budget **5–10s per MPC signature** in the demo script (off the hot-path VIEW; explain as real security work, not a bug). Confirm the full webhook payload shape (`ServerKeyShare` + `walletId`/`walletApiKey`/etc.) from the SDK before wiring — currently partially reverse-engineered ⚠️.

---

## Decision Dependency Order (build sequence)
1. **D0** (topology) → unblocks deploy target.
2. **D2 asset-binding + D3 signature + D9 keying** (hour-0/1 interface pins) → unblock Lane A hot-path body. *Do not parallelize contract + UI until D3 `grantMandate` signature is locked.*
3. **D2/D6** GatedToken + EligibilityResolver + AgentBook mirror (Lane A).
4. **D10** revert wiring on the token (Lane A) ↔ Lane C decode.
5. **D11** Node sidecar + agent loop (Lane B); **D5** payment.
6. **D7** yield vault, **D8** TEE — last, both cuttable.

---
*Sources: cross-domain research compact (13 domains) + still-open-questions loop (12 items). MEDIUM-confidence and ⚠️ items are recommendations pending hour-0 verification, not settled fact.*
