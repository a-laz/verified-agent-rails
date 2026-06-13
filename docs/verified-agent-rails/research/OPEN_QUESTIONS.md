# Verified Agent Rails — Open Questions (Morning Standup)
*Every unresolved question, grouped by domain, with why it matters and where to resolve it. Work top to bottom.*

> **Feasibility verdict: GO — but five interface/topology values must be pinned at hour 0 before contract and UI lanes parallelize.** Anything below marked ⚠️ is unverified. Resolve the DECIDE-FIRST item before choosing a deploy target; resolve the four interface signatures before Lane A writes the hot-path body.

---

## 🔴 DECIDE FIRST — Chain Topology (existential, hour-0, blocks deploy target)

**Q. Does the Circle/Arc bounty at ETHGlobal NYC (June 12–14, 2026) accept an Arc-TESTNET demo, or require Arc-MAINNET settlement? And does the World ID $15K track accept an Arc-testnet project, or require World Chain / Base / Ethereum?**
- **Why it matters:** Arc mainnet does **not** launch until summer 2026 — *after* the hackathon. The entire plan is locked to Arc testnet (Chain ID `5042002`). If the Arc bounty requires mainnet, the Arc-locked architecture is **impossible** and VAR must pivot to a **World Chain monolith** (Chain ID 480) on day one — different addresses, RPC, and USDC interface. This single fact decides which codebase Lane A writes.
- **Resolve where:** Sponsors directly — Circle/Arc track lead + World ID track lead at the event. Confirm in person hour 0. (domain: integration)
- **Decision rule:** Arc testnet accepted → ship Arc monolith (current plan, 75% safe pending State Bridge spike). Arc mainnet required → ship World Chain monolith (95% safe, zero cross-chain risk, may forfeit Arc bounty).
- **Secondary spike (same hour):** World ID State Bridge deploy to Arc testnet is permissionless but **UNPROVEN** ⚠️ — no public examples. Run a hour-0 POC before committing to Arc. (domain: integration)

---

## ERC-8226 / EligibilityResolver (Lane A — hot-path signature)

**Q. Lock the `EligibilityResolver` asset-binding pattern decisively.** Pattern B (explicit `address asset` param) vs single-token binding (asset omitted, spec-conformant). Emit ONE canonical Solidity signature and state how the asset whitelist is enforced relative to it.
- **Why it matters:** Direct contradiction across domains. `rwa_compliance` locked Pattern B; `eip8226`/`arc`/`integration` recommend single-token binding. **Lane A cannot write the hot-path body until this is one value.** Highest-leverage open interface decision.
- **Resolve where:** Lane A lead, hour 0. Recommended (per Dossier Decision #5): `isActiveForAmount(uint256 agentId, address principal, uint256 amount)` bound to a single hardcoded `GatedToken`; asset check moves into `GatedToken.canTransfer` (`mandate.onChainScope.assetAddress == address(this)`). (domain: eip8226)

**Q. Does ERC-8226 exist as a private/unpublished draft anyone on the team holds?** If so, share it to ground the resolver interface; if not, name VAR's contract explicitly as the reference impl for judges.
- **Why it matters:** 9 of 13 domains found no public ERC-8226 ⚠️. VAR is shipping a self-defined spec. Must be transparent for judges; affects repo naming.
- **Resolve where:** VAR team confirm internally, hour 0. (domain: eip8226 / aa_delegation / integration)

---

## Security / Mandate signature scheme (Lane A + Lane C — blocks both)

**Q. Pin the exact `grantMandate(...)` parameter list, order, and types, and whether the human's authorizing signature is (a) a calldata arg with on-chain ECDSA/EIP-712 recovery or (b) stored separately.** Reconcile the two circulating lists and emit ONE pinned signature.
- **Why it matters:** Two incompatible parameter lists are live: the eip8226 proposal `(agentId, principal, identityRef, scopeHash, onChainScope, complianceProvider, validFrom, validUntil, signature)` vs the aa_delegation/security candidate `(principal, agentId, spendCap, address[] assetWhitelist, expiry)`. **Lane A and Lane C both block on this.** No Solidity finalizes until it converges.
- **Resolve where:** Lane A + Lane C joint decision, hour 0. (domain: security)

**Q. Does Dynamic's `delegatedSignMessage` accept EIP-712 TypedData structs, or EIP-191 raw messages only?** Extract from the `@dynamic-labs` Node SDK `.d.ts` definitions. Return the exact signature and accepted message types.
- **Why it matters:** Single gate on whether `grantMandate` uses a domain-separated EIP-712 scheme or must fall back to EIP-191 contract-side ECDSA recovery. Inferred-but-unconfirmed across 3 rounds ⚠️ — resolve from SDK source, not speculation. **Hour-0 blocker for Lane C.**
- **Resolve where:** Lane C — read the installed SDK TypeScript defs directly. (domain: aa_delegation)

**Q. Is `recordExecution` a post-transfer hook in the gated token, or a callback the agent loop must call — and who enforces atomicity?**
- **Why it matters:** If MVP keeps per-tx caps only (Dossier Decision #4), `recordExecution` is a no-op and this softens. But if cumulative caps slip into scope, a non-atomic record breaks the spend cap. CHOICE recommended: post-transfer hook in the gated token. (domain: security)

**Q. What is the exact signature scheme `grantMandate` uses to validate identity (EIP-191 / EIP-712 / raw ECDSA)?** This is THE bypass vector if weak.
- **Why it matters:** A weak or unverified signature recovery lets anyone forge a mandate. Must recover signer and assert `signer == principal`. (domain: security)

---

## ERC-8004 / agent keying (Lane A — latent compile bug)

**Q. Key the Mandate by agent-wallet address or by `agentId`? And confirm the exact ERC-8004 resolution function — because `getActivePrincipal` does NOT exist.**
- **Why it matters:** `security` found `getActivePrincipal` is fictional ⚠️ but appears in VAR's CONTRACTS.md code samples — a **latent compile/runtime bug**. ERC-8004 exposes `getAgentWallet(agentId)→address` only. Decide: key by wallet (simpler, accept rotation as a documented limitation) or by `agentId` (survives rotation). State how `m.agent` is populated and resolved on the hot path.
- **Resolve where:** Lane A, hour 1 — fix CONTRACTS.md code samples first. (domain: eip8004)

**Q. Principal staleness on rotation:** if the agent wallet is rotated in the identity registry, does VAR invalidate the mandate or update the principal link, and who initiates rotation?
- **Why it matters:** A stale principal means revocation may target the wrong human. Recommended: re-resolve agent→principal every `isActiveForAmount` call; compare against the principal stored at grant time; revert on mismatch. (domain: security)

---

## World ID / AgentBook anchoring (Lane A seeding + Lane B resolver)

**Q. Extract the exact World AgentBook lookup signature (`resolveHuman` / equivalent) and return type from `@worldcoin/agentkit` source.** If AgentBook is a hosted service with no canonical on-chain ABI, confirm VAR is free to define `resolveHuman(address agentWallet) → address human`.
- **Why it matters:** Lane A seeding contract and Lane B resolver both reference this. Domains disagree on whether there's a canonical ABI to match or a free design choice ⚠️. The worldid domain's resolved finding leans "AgentBook is a service, not a contract — `resolveHuman` ABI is a free design choice." Confirm from package source, not docs.
- **Resolve where:** Lane A/B — read `@worldcoin/agentkit` TypeScript defs. (domain: worldid)

**Q. Pin `Mandate.identityRef` binding:** raw `nullifierHash`, or composite `keccak256(abi.encodePacked(nullifierHash, agentWallet))`?
- **Why it matters:** Determines **demo-repeatability across dry-runs** — whether revocation clears the nullifier (allowing re-registration of the same agent) or marks the agentWallet independently inactive. Affects the AgentBook seeding contract and the climax rehearsal loop. Genuinely unresolved; flagged by worldid + arc. (domain: worldid)

**Q. What `externalNullifierHash` constant does VAR use** to scope the one-time human registration?
- **Why it matters:** Wrong scope lets a human re-register across contexts. Recommended constant: `keccak256(abi.encodePacked('verified-agent-rails-agentbook'))`, passed to IDKit client-side and `verifyProof` contract-side. (domain: worldid)

---

## Dynamic / signing path (Lane B — backend bridge)

**Q. Confirm the full Dynamic delegation webhook payload shape** beyond the known `ServerKeyShare = {pubkey: {pubkey: Uint8Array}, secretShare: string}`. Are there `walletId`, `walletApiKey`, `keyShare`, `timestamp`, `expiryTime`, `webhookSignature` fields?
- **Why it matters:** Lane B's signing path is **unimplementable without the exact payload** ⚠️. Currently partially reverse-engineered; gaps surface as runtime bugs at hour 28. Source from Dynamic SDK or closed-alpha docs.
- **Resolve where:** Lane B — Dynamic SDK / closed-alpha docs. Confirm closed-alpha TSS-MPC access for the demo environment first. (domain: dynamic)

**Q. Can Fireblocks NCW / Dynamic agent-signing be called from Python, or is the Node SDK the only path?**
- **Why it matters:** No Python SDK confirmed ⚠️ → FastAPI backend needs a Node.js HTTP sidecar (`/sign-transaction`). Adds 2–4h build + a new failure point. Confirm before wiring the bridge. (domain: dynamic / aa_delegation)

---

## Arc / Circle settlement + revert codes (Lane A token + Lane C decode)

**Q. Confirm the ERC-1404-style revert wiring end-to-end.** `GatedToken` owns `detectTransferRestriction(from,to,amount)→uint8` and `messageForTransferRestriction(uint8)→string`; revert emits `TransferRestricted(uint8 code, string message)`; codes 0–6 binding (`0=OK, 1=NO_PASSPORT, 2=MANDATE_REVOKED, 3=MANDATE_EXPIRED, 4=OVER_SPEND_CAP, 5=ASSET_NOT_WHITELISTED, 6=NOT_VERIFIED_HUMAN`). Confirm ethers.js v6 natively decodes this custom error, and whether codes are closed or extensible (`7=CALLER_NOT_AGENT`).
- **Why it matters:** Lane A token design and Lane C decode path both depend on a single documented answer. The contract-home assignment (GatedToken vs resolver) and the ethers decode confirmation still need locking. ⚠️ verify ethers v6 decode behavior.
- **Resolve where:** Lane A + Lane C, hour 1. (domain: arc / security / aa_delegation)

**Q. Is CCTP integrated with Arc testnet (bridge address), or must the demo use a faucet for test USDC?**
- **Why it matters:** No test USDC = no demo. Confirm a funding path for grant tx + agent payments + vault deposits. ⚠️ CCTP-to-Arc-testnet availability unclear. (domain: arc / yield)

**Q. What is the minimum gas fee (in USDC) on Arc testnet now?**
- **Why it matters:** Needed to set realistic agent spend caps and fund the demo wallet. ⚠️ not in data. (domain: arc)

---

## Agent payments / x402 (touches "zero new trust" invariant)

**Q. Circle Gateway custody model for x402 nanopayments:** can the agent's own wallet hold the funded Gateway USDC balance and authorize EIP-3009 payments directly, or must a backend operator hold the Gateway balance and relay the agent's authorizations?
- **Why it matters:** Touches the **"zero new trust assumptions"** invariant directly. If a backend operator must hold the Gateway balance, the payment beat introduces an off-hot-path trust party that must be disclosed to judges. Unresolved across rounds ⚠️.
- **Resolve where:** Circle docs / Gateway SDK. Default to plain USDC transfer for MVP if unresolved (keeps the invariant clean). (domain: agent_payments)

---

## Yield leg (Lane A — assetWhitelist scope)

**Q. Confirm the yield artifact: 1:1 stub ERC-4626 vault (all 16 functions) vs real Hashnote USYC.** Confirm the stub is chosen, the share token implements ERC-7943 `canTransfer`, and `Mandate.assetWhitelist` whitelists the SHARE TOKEN only. Also confirm whether yield is core-demo or cuttable.
- **Why it matters:** Determines `assetWhitelist` scope and whether a 24–48h USYC allowlist request lands on the critical path. Mostly converged on the stub, but the cuttable/core decision and share-token gating wiring need a final lock. Recommended: stub vault, share-token-only whitelist, **cuttable P2**. (domain: yield)

---

## Hot-path semantics (Lane A/B integration — doc contradiction)

**Q. Does the MVP omit cumulative spend tracking entirely?** (`recordExecution` is a no-op, `spent` field removed or always 0, cap check is pure per-tx VIEW.) Harmonize CONTRACTS.md §2 to match.
- **Why it matters:** `aa_delegation` flagged that CONTRACTS.md §2 defines cumulative-semantics fields (`spent` + `m.spent+amount > spendCap`) that **contradict** BUILD_PLAN.md §2's per-tx-only MVP scope — an integration bug waiting at hour 28. ~30 min doc fix, high blast radius. State the final Mandate struct fields for MVP **before** hot-path coding.
- **Resolve where:** Lane A lead — reconcile CONTRACTS.md §2 ↔ BUILD_PLAN.md §2, hour 1. (domain: aa_delegation)

---

## Lower-priority / stretch (resolve only if pursuing the relevant lane)

| Q | Why | Domain |
|---|---|---|
| Idle funds post-revocation: implement on-chain sweep, or accept "stranded"? | Recommended accept stranded for MVP (P3); document a manual recovery flow. | aa_delegation |
| Can VAR's FastAPI loop be containerized as a Phala dstack CVM, or must TEE use Eliza? | Gates the TEE stretch approach. | tee |
| Does Dynamic TSS-MPC signing work inside a TEE with restricted network? | Only if combining the TEE + signing stretches. | tee |
| ERC-8004 `getAgentWallet`/`getAgentURI` interface stable as of June 2026? | If keying Mandate by `agentId`, must not break mid-build. | yield / eip8004 |
| Can agents spawn sub-agents (nested World ID delegation)? | Out of MVP scope; World ID 4.0 supports human→agent delegation, nesting unconfirmed. | worldid |
| Yield instrument whitelist (Aave/Lido/Yearn) if going real | Moot if using stub vault. Aave V4 Arc deploy not guaranteed (52.58% DAO support). ⚠️ | yield / landscape |

---
*All ⚠️ items are unverified and must not be treated as fact in the build. No invented addresses/signatures appear above; recommended values are flagged as recommendations. Source: still-open-questions loop (12 items) + per-domain residual questions.*
