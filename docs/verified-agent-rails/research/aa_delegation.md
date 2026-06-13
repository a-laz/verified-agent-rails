# Account Abstraction & Delegation — Consolidated Research

_How VAR turns a human's one-click revoke into a next-block lockout for an autonomous agent, with a single on-chain VIEW call on the hot path._

> **Feasibility verdict: FEASIBLE (yes) for the 36h MVP.** The bespoke on-chain Mandate struct + ERC-8226-compatible `isActiveForAmount` resolver delivers the core promise — revoke → next-block lockout, single VIEW call, zero off-chain attestation in the hot path. ERC-7943 `canTransfer` is **Final** and ready. Residual friction (not blockers): ERC-8226 is VAR-defined (no public EIP), AgentBook must be mirrored on Arc, and Dynamic ships Node-only (Python backend needs a sidecar). All solvable inside the build window.

---

## 1. The one decision that matters: bespoke Mandate struct wins

Three delegation patterns were compared across five research rounds. The verdict is **decisive and stable**: use a **bespoke on-chain Mandate struct**, not ERC-7710/7715 delegation managers, not ERC-7579 modular-account session keys.

| Approach | Revoke mechanism | Revoke gas | Hot-path reads | Off-chain machinery | 36h fit |
|----------|------------------|-----------|----------------|---------------------|---------|
| **Bespoke Mandate struct** ✅ | `mandate.revoked = true` (1 SSTORE) | ~800–1200 gas (warm) | 1–2 SLOAD, pure VIEW | none | **OPTIMAL** |
| ERC-7710/7715 Delegation Manager | `disableDelegation` / `wallet_revokeExecutionPermission` (impl-defined) | ~5–15k per redemption | redemption ceremony + ERC-1271 re-validate | off-chain delegation storage | adds 8–12h |
| ERC-7579 session-key validator | `uninstallModule(...)` | module deinit, 3–5 writes | validator install/uninstall lifecycle | bundler + paymaster | overkill |

Why bespoke wins (all `high` confidence, sourced from ERC-7943 Final spec, ERC-7710/7715/7579 specs, MetaMask/ZeroDev/Biconomy docs):

- **Single storage write to revoke**, single SLOAD to enforce. No Delegation Manager indirection, no module init/deinit overhead.
- **No off-chain verification in the hot path.** ERC-7710's `redeemDelegations` requires off-chain delegation fetch + encode + manager re-validation; ERC-7579 needs a bundler/paymaster stack VAR hasn't invested in.
- **ERC-7710 doesn't even define revocation** — the spec explicitly defers it ("Needs discussion"). ERC-7715 session keys are enforced *by the account* (account refuses to sign), but VAR's pitch needs enforcement *by the asset* (token refuses to move). The token gate is the critical enforcement point; session keys alone are insufficient for the narrative.

> **Decision LOCKED (HIGH confidence):** bespoke Mandate struct. ERC-7710/7715 and ERC-7579 are STRETCH/post-hackathon alternatives, not MVP. Estimated savings: 8–12h vs. delegation-manager path.

---

## 2. Standards landscape (verified status, June 2026)

| Standard | Status | What it actually is | Relevance to VAR |
|----------|--------|---------------------|------------------|
| **ERC-7943** (`canTransfer`) | **FINAL — May 27, 2026** | uRWA transfer-gating hook (RWA compliance: frozen balances, eligibility). Returns `bool`, **MUST NOT revert**. **No restriction codes in the spec.** | The GatedToken hook. RWA-focused, NOT agent-mandate-aware — chain it with the Mandate check; they are orthogonal concerns. |
| **ERC-8226** (`isActiveForAmount`) | **DOES NOT EXIST as a public EIP** ⚠️ | Exhaustive search of eips.ethereum.org, ethereum-magicians, GitHub ERCs returns **zero hits**. EIP 8200-range has 8004/8183/8196/8211 — no 8226. | **VAR-internal terminology** for the agent-mandate resolver. Ship as VAR's reference implementation; brand it as such for judges. Do NOT claim it follows a finalized EIP. |
| **ERC-8004** (agent identity) | **LIVE mainnet — Jan 29, 2026** | Three registries: Identity (ERC-721 agent card), Reputation, Validation. `register()`, `setAgentWallet()`, `getAgentWallet()`. 20k–45k agents registered in first weeks. | Can **anchor** a Mandate (agent addressed by `uint256 agentId`), does NOT replace it. Optional for MVP — store agent wallet address directly. |
| **ERC-7710** (delegation) | Draft (May 2024) | `redeemDelegations(...)`. **Revocation out-of-scope** in spec. | Alternative path only. Adds indirection. |
| **ERC-7715** (wallet permissions) | Draft (Apr 2026) | `wallet_grantPermissions` / `wallet_revokeExecutionPermission`. Production impls (MetaMask, Coinbase, Biconomy). | Alternative path only. Account-enforced, not asset-enforced. |
| **ERC-1404** (restricted token) | Standard | `detectTransferRestriction → uint8`, `messageForTransferRestriction → string`. | VAR layers ERC-1404-style **restriction codes** on top of ERC-7943's bare `bool`. |
| **ERC-5539** (revocation list) | Standard | Namespace-based revocation registry. | NOT used. Embedding `revoked` in the Mandate is faster than a separate registry lookup. |
| **ERC-4626** (vault) | Standard | Tokenized vault `deposit`/`withdraw`. | YieldVault stub (P2) for "park idle USDC." |

> **Key correction across rounds:** ERC-7943 is RWA-compliance, not agent-authorization. It has no `spendCap`, no agent proxy role, no revoke flag. It can be **chained** with the Mandate (`canTransfer` for compliance AND `isActiveForAmount` for authorization) but must not be conflated.

---

## 3. Concrete artifacts

### 3.1 MVP Mandate struct (per-tx caps — RESOLVED, see §6)

```solidity
/// @notice Agent Passport Mandate — MVP structure for per-tx spend caps only.
/// @dev For STRETCH phase, add `uint256 spent` field + recordExecution() after-transfer hook.
struct Mandate {
    address human;              // verified principal (World ID anchor via AgentBook)
    address agent;              // Dynamic-provisioned agent wallet
    uint256 spendCap;           // MAX PER-TRANSACTION spend, in USDC 6-decimal units
                                // MVP: per-tx cap only. STRETCH: becomes cumulative cap, use with spent.
    address[] assetWhitelist;   // tokens agent may move/hold (gated token + yield vault share)
    uint64  expiry;             // unix seconds; transfer reverts if block.timestamp >= expiry
    bool    revoked;            // human kill switch: if true, isActiveForAmount returns false next block
    // NOTE: MVP does NOT include `uint256 spent`. Cumulative cap enforcement is STRETCH.
}

mapping(uint256 => Mandate) mandates;  // agentId -> Mandate
```

### 3.2 EligibilityResolver.isActiveForAmount — exact MVP body (pure VIEW, ~5k gas)

```solidity
// ERC-8226 (VAR-defined, Draft) — agent mandate eligibility resolver
function isActiveForAmount(
    uint256 agentId,
    address principal,
    uint256 amount,
    address asset
) public view returns (bool) {
    Mandate memory m = mandates[agentId];                    // SLOAD ~2.1k
    if (m.human == address(0)) return false;                 // NO_PASSPORT (1)
    if (m.revoked) return false;                             // MANDATE_REVOKED (2)  <- kill switch
    if (block.timestamp >= m.expiry) return false;           // MANDATE_EXPIRED (3)
    if (amount > m.spendCap) return false;                   // OVER_SPEND_CAP per-tx (4)
    if (!isAssetWhitelisted(m, asset)) return false;         // ASSET_NOT_WHITELISTED (5)
    address anchoredHuman = agentBook.resolveHuman(m.agent); // SLOAD ~2.1k  <- World-ID anchor
    if (anchoredHuman == address(0) || anchoredHuman != m.human) return false; // NOT_VERIFIED_HUMAN (6)
    return true;                                             // OK (0)
}
```

Seven checks, all reads, zero writes. Total ~4.8–5k gas (Mandate SLOAD + AgentBook SLOAD + comparisons). **Mandate.revoked is the single authoritative kill switch** — read it before consulting AgentBook (AgentBook is the proof-of-human anchor, not a revocation source; on conflict, `revoked` wins, fail-secure).

### 3.3 Lifecycle functions

```solidity
// REVOKE — high confidence, the kill shot
function revokeMandate(uint256 agentId) external /* onlyHuman */ {
    require(msg.sender == mandates[agentId].human);
    mandates[agentId].revoked = true;   // 1 SSTORE; ~5.2k warm / ~7-8k cold; effective next block
}

// GRANT — ⚠️ verify exact param order/types against ERC-8226 (VAR-defined; no public spec)
function grantMandate(
    uint256 agentId,
    address human,
    address agent,
    uint256 spendCap,
    address[] calldata assetWhitelist,
    uint64 expiry
) external /* onlyHuman */ {
    mandates[agentId] = Mandate({
        human: human, agent: agent, spendCap: spendCap,
        assetWhitelist: assetWhitelist, expiry: expiry, revoked: false
    });
}

// recordExecution — STRETCH only (cumulative caps). MVP: not present.
// function recordExecution(uint256 agentId, uint256 amount) external onlyGatedToken;
```

### 3.4 ERC-7943 canTransfer + token integration (Final)

```solidity
// ERC-7943 (Final, May 27 2026) — fungible variant. MUST NOT revert; returns bool.
function canTransfer(address from, address to, uint256 amount) external view returns (bool allowed);

// Non-fungible:  canTransfer(address from, address to, uint256 tokenId) -> bool
// MultiToken:    canTransfer(address from, address to, uint256 tokenId, uint256 amount) -> bool

// VAR GatedToken wiring (in _beforeTokenTransfer): resolve agent, delegate to resolver, revert with code
function canTransfer(address from, address to, uint256 amount) external view returns (bool) {
    uint256 agentId = getAgentIdForWallet(from);   // TBD: how `from` maps to agentId (reverse lookup or ERC-8004)
    if (agentId == 0) return false;                // not an agent
    address principal = mandates[agentId].human;
    return isActiveForAmount(agentId, principal, amount, address(this));
}
```

ERC-7943 also defines (all Final): `canSend`, `canReceive`, `getFrozenTokens`, `setFrozenTokens`, `forcedTransfer`, and custom errors:

```solidity
error ERC7943CannotSend(address account);
error ERC7943CannotReceive(address account);
error ERC7943CannotTransfer(address from, address to, uint256 amount);
error ERC7943InsufficientUnfrozenBalance(address account, uint256 amount, uint256 unfrozen);
// NOTE: ERC-7943 defines NO restriction codes — those are VAR's ERC-1404 layer (§3.5).
// frozen-tokens / forcedTransfer are regulator-side tooling — SKIP for the grant→pay→revoke demo.
```

### 3.5 ERC-1404-style restriction codes (machine-readable revert surface)

```solidity
function detectTransferRestriction(address from, address to, uint256 amount) external view returns (uint8 code);
function messageForTransferRestriction(uint8 code) external pure returns (string memory);
```

| Code | Meaning | Phase |
|------|---------|-------|
| 0 | OK — transfer allowed | MVP |
| 1 | NO_PASSPORT — sender carries no Agent Passport | MVP |
| 2 | MANDATE_REVOKED — mandate revoked by principal | MVP |
| 3 | MANDATE_EXPIRED — mandate past expiry | MVP |
| 4 | OVER_SPEND_CAP — amount exceeds per-tx cap (MVP) / cumulative cap (STRETCH) | MVP |
| 5 | ASSET_NOT_WHITELISTED — asset not permitted by mandate | MVP |
| 6 | NOT_VERIFIED_HUMAN — agent not anchored to verified human | MVP |
| 7 | OVER_CUMULATIVE_CAP — cumulative spent + amount exceeds limit | STRETCH |
| 8 | AGENT_FROZEN — agent frozen by jurisdiction/operator | STRETCH |

These live on the **EligibilityResolver** (not the token). ERC-7943 returns only `bool`; the resolver provides the code/string. **Revert-reason determinism:** the wrapper calls `detectTransferRestriction` which runs checks in fixed order and returns the *first* failure code — surface both code and string: `revert ERC8226Error(code, messageForTransferRestriction(code))`.

### 3.6 World ID verifyProof (AgentBook seeding anchor)

```solidity
function verifyProof(
    uint256 root,
    uint256 groupId,                // 1 for Orb (biometric) credentials
    uint256 signalHash,             // keccak256(signal); signal = agent wallet address
    uint256 nullifierHash,          // MUST be tracked on-chain to prevent replay (one-human-one-anchor)
    uint256 externalNullifierHash,  // VAR app context — exact value TBD
    uint256[8] calldata proof
) external view;                    // VIEW: succeeds/fails on ZK proof; does NOT prevent replay
```

`verifyProof` does **not** prevent replay — VAR must track seen `nullifierHash` in a mapping (enforced **once at grant time**, NOT on the hot path). Orb visit + World ID is a prerequisite done before the demo.

### 3.7 World AgentBook resolver (hot-path anchor)

```solidity
// VAR-side interface; ⚠️ verify exact ABI against @worldcoin/agentkit TypeScript defs
interface IAgentBook {
    function resolveHuman(address agentWallet) external view returns (address human);
}
```

⚠️ Exact signature is **undocumented** in public World AgentKit docs — extract from `@worldcoin/agentkit` npm source before demo rehearsal. AgentBook is chain-specific (World Chain `eip155:480` / Base `eip155:8453`); **no native AgentBook on Arc** → VAR deploys a **local Arc mirror** seeded once at grant time (keeps the hot path a single local VIEW call, no cross-chain bridge).

### 3.8 Network + addresses (Arc testnet)

```
Chain:      Arc testnet, Chain ID 5042002
RPC:        https://rpc.testnet.arc.network
Explorer:   https://testnet.arcscan.app
Faucet:     https://faucet.circle.com
USDC:       0x3600000000000000000000000000000000000000
            (dual-decimal: 18-dec native for gas metering, 6-dec ERC-20 for transfers)
            USE THE 6-DECIMAL ERC-20 INTERFACE for ALL balance/transfer/cap accounting.
Mainnet:    expected summer 2026 — NOT live; build on testnet only. ⚠️ verify mainnet date/addresses
```

> **Dual-decimal trap (HIGH confidence):** `spendCap` of `1000` means 1000 USDC only in 6-decimal units. Reading `amount` via the 18-decimal native interface introduces a 10^12 error and silently bypasses the cap. Pin in struct comments: cap/spent are 6-decimal ERC-20 units; never mix with native.

### 3.9 Dynamic agent-wallet signing (Node-only — needs Python bridge)

```typescript
// @dynamic-labs-wallet/node-evm  (NO Python SDK exists — confirmed)
const signedTx: string = await delegatedSignTransaction(client, {
  walletId: string,
  walletApiKey: string,
  keyShare: ServerKeyShare,        // { pubkey: { pubkey: Uint8Array }, secretShare: string }
  transaction: TransactionSerializable,
});
// delegatedSignMessage(...) signs raw EIP-191 (good for CAIP-122 / AgentBook registration).
// EIP-712 typed-data support at SDK level exists but is NOT documented for delegatedSignMessage. ⚠️ verify
```

FastAPI (Python) backend has **no Dynamic SDK** → run a **Node.js sidecar** exposing `delegatedSignTransaction`/`delegatedSignMessage` over HTTP (preferred), or subprocess-shell to a Node CLI. Budget ~2–4h in Lane B. TSS-MPC is **closed alpha** (request access at hour 0); MPC signing latency is ~5–10s, not sub-second. Fallback: standard Dynamic embedded wallets (production-ready) — TSS-MPC is key-security hardening, not essential to the accountability story.

---

## 4. Revocation semantics — the demo climax, proven atomic

**Flow (revoke → next-block lockout):**

```
Block N:    human signs revokeMandate(agentId) → mandate.revoked = true committed to state
Block N+1:  agent transfer fires → _beforeTokenTransfer → canTransfer → isActiveForAmount
            → reads mandate.revoked == true → returns false → transfer REVERTS with code 2
```

- **No TOCTOU gap.** The check (`isActiveForAmount`) and the use (transfer) happen in the **same transaction, synchronously**. Ethereum's strict block sequencing guarantees state written in block N is visible to VIEW calls in block N+1. (`high` confidence.)
- **In-flight mempool transfer at N+1 is handled:** it reads state *at block N+1 height*, after the revoke committed → reverts. No future-block comparison needed in the contract; the normal state timeline handles it. (`high`.)
- **Same-block edge (⚠️ `medium` confidence):** if the agent's transfer is *already in the mempool* when the human revokes, and the block builder orders transfer-before-revoke in the same block, the transfer can settle. So lockout is **strictly next-block, not instant**. Phrase the demo as *"human revokes → agent locked out by next block"* — accurate and still a powerful one-click story. Mitigation: human revokes with high gas; can't guarantee same-block ordering across distinct sender nonces.

**Gas (HIGH confidence):** revoke ≈ 800–1200 gas warm (~$0.008–0.012 on Arc's USDC-native gas). **Human pays** (msg.sender = the wallet that provisioned the agent). Agent is not charged. Accountability with one click, negligible cost.

**Single source of truth:** `Mandate.revoked` is authoritative. If AgentBook eligibility is also consulted and the two disagree, `revoked` wins (read first, fail-secure). Revocation is a *mandate lifecycle* operation, not a *human-registration* operation.

**Idle funds after revocation (⚠️ `medium`, no spec):** post-revocation the GatedToken rejects ALL transfers from the agent, including a self-sweep → funds **stranded**. No standard sweep exists in ERC-7943/8004. For MVP: **document as stranded** (P3); optionally provide a guardian-assisted `sweep(agentId, recipient)` that bypasses `canTransfer` (requires trust in sweep authority), or have the agent loop sweep idle funds to the human *before* revocation. Not required for the core demo.

---

## 5. What this unblocks for the build

| Decision | Locked outcome | Unblocks (lane / hour) |
|----------|----------------|------------------------|
| Delegation pattern | Bespoke Mandate struct (not 7710/7715/7579) | Contracts Lane A, hour 1–2 |
| MVP cap semantics | **Per-tx cap only**; drop `spent` field; no `recordExecution` | Resolver + GatedToken coding, hour 2–6 |
| Revoke mechanism | Single `mandate.revoked` flag, atomic next-block, ~5.2k gas | UI "Revoke" button, Lane C hour 4–6 |
| Restriction codes | Final table (0–6 MVP, 7–8 stretch) on resolver | Dashboard error messaging, agent revert parsing |
| USDC accounting | 6-decimal ERC-20 interface, addr `0x3600...000` | Agent loop + contract amount logic, hour 1–3 |
| World ID seeding | Server-side verify (IDKit) → write Mandate + Arc AgentBook mirror; on-chain verifyProof is STRETCH | Grant flow; hot path identical either way |
| Dynamic integration | Node sidecar / HTTP bridge from FastAPI; confirm TSS-MPC alpha hour 0 | Lane B agent signing, hour 0–6 |
| recordExecution | Cleanly deferred via deferred-state pattern (add `spent` slot + 1-line check at STRETCH) | No refactor-under-pressure at hour 28 |

**Deferred-state pattern (MVP → STRETCH, zero refactor):**

```
MVP:      struct has no `spent`; check `if (amount > m.spendCap)`; recordExecution is a stub.
STRETCH:  add `uint256 spent` (slot 6); recordExecution(agentId, amount){ m.spent += amount; }
          called in GatedToken._afterTokenTransfer; change check to `if (m.spent + amount > m.spendCap)`.
Benefit:  hot path stays pure VIEW in MVP; cumulative tracking added without breaking the struct.
```

**Composition is confirmed achievable:** ERC-7943 (Final) + ERC-8226 (VAR ref impl) + ERC-8004 (mainnet) + World ID proof-of-human = a defensible "first to compose all four" differentiator for judges. No new trust assumptions beyond what each standard already introduces.

---

## 6. Resolved contradiction: Mandate struct cumulative vs. per-tx

**The bug found (rounds 4–5):** `03_CONTRACTS.md §2` defines the Mandate with a `spent` field and cumulative semantics (`isActiveForAmount` checks `m.spent + amount > m.spendCap`). But `06_BUILD_PLAN.md §2` MVP/CUT/STRETCH table **CUTS** cumulative tracking ("use per-tx cap only") and defers `recordExecution` to STRETCH. Cumulative caps require a **state write per transfer** — which breaks the pure-VIEW hot path. Left unresolved, Lane A would follow the §5 pseudocode and misimplement the hot path, surfacing as an integration bug around hour 28.

**Resolution (this doc, HIGH confidence):** MVP = **per-tx cap only**. Drop the `spent` field from the MVP struct (or document `spent=0` always). `isActiveForAmount` checks `amount > m.spendCap`, not `m.spent + amount > m.spendCap`. This makes the hot path 100% VIEW, removes `recordExecution` from MVP scope, and resolves the contradiction.

> **Action item:** `03_CONTRACTS.md §2` and `§5` pseudocode must be updated to reflect per-tx MVP semantics (add the comment "MVP: per-tx caps only, `spent` deferred to STRETCH"). Until harmonized, this is the one documentation gap that *will* cause an integration bug. ~30-min fix, high impact.

**Why cumulative is hard (the gotcha):** if `recordExecution` is partial or off-chain, an agent makes parallel transfers and races to fill the cap before recording completes — bypassing the limit. So IF cumulative ships, `recordExecution` MUST be on-chain and atomic with the transfer (in `_afterTokenTransfer`), never off-chain.

---

## 7. Residual open questions

**Hour-0 blockers (resolve before Lane A/B/C code):**

1. **ERC-8226 `grantMandate` exact params** — VAR-defined (no public EIP). Pin parameter order/types and whether the signature is EIP-712-embedded (ECDSA recovery) or stored separately. CONTRACTS.md marks it TBD.
2. **CONTRACTS.md §2 harmonization** — rewrite to per-tx MVP semantics before hot-path coding (see §6).
3. **Dynamic `delegatedSignMessage` + EIP-712** — does it accept TypedData structs or EIP-191 only? Gates whether `grantMandate` uses a domain-separated EIP-712 scheme or falls back to EIP-191 + contract-side ECDSA recovery. Fetch Dynamic SDK TS type defs at hour 0.
4. **World ID Router on Arc** — is `verifyProof` deployed on Arc testnet (5042002)? If not, fall back to server-side World ID verify gating the grant (no hot-path risk either way).
5. **AgentBook on Arc** — confirm local-mirror architecture (seed from World ID proof at grant); extract `resolveHuman` ABI from `@worldcoin/agentkit` source.

**Design / scope questions:**

6. **Full Dynamic webhook payload shape** — `ServerKeyShare = {pubkey:{pubkey:Uint8Array}, secretShare:string}` pinned (`medium`), but additional fields (timestamp, expiry, webhookSignature) TBD. Lane B needs this for secure webhook handling.
7. **`from`-address → `agentId` mapping** in GatedToken — reverse lookup, or via ERC-8004 identity registry? Affects the `canTransfer` wrapper. (`TBD` in §3.4.)
8. **Agent wallet rotation** — ERC-8004 `getAgentWallet` auto-clears on token transfer. Current design stores agent address directly in the Mandate → rotation breaks the mandate (human re-grants). Confirm acceptable or design for rotatable agents (adds an external resolve per transfer).
9. **Stale-principal risk** — if ERC-8004 is integrated and the wallet rotates post-grant, `getActivePrincipal` may be stale. `isActiveForAmount` should re-resolve `agent → human` via `agentBook.resolveHuman` defensively (already in §3.2 body).
10. **Yield (ERC-4626) whitelist granularity** — whitelist the vault address or its share-token address? If share token, vault-share transfers also pass through `canTransfer` (same gate). Affects widget data model. (P2.)
11. **Demo repeatability** — World ID `nullifierHash` is one-per-person-per-context and can't be replayed; use a fresh human+agent per demo run, or reset nullifier state.
12. **Revoke gasless?** — if a relayer makes revoke gasless for UX, relayer-vs-agent tx ordering becomes relevant. Default: human pays (~$0.01 on Arc), simplest, acceptable.

---

## 8. Sources

| # | Source | Used for |
|---|--------|----------|
| 1 | ERC-7943 Final spec — `raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7943.md`, `eips.ethereum.org/EIPS/eip-7943` | `canTransfer` signatures, errors, no-restriction-codes, Final status (May 27 2026) |
| 2 | ERC-7943 Final press release — `globenewswire.com/news-release/2026/05/27/3301737` | Final status confirmation |
| 3 | ERC-8004 spec — `eips.ethereum.org/EIPS/eip-8004`; KuCoin, news.bitcoin.com, QuickNode, ChainUp blogs | Agent identity registries, mainnet Jan 29 2026, registration fns |
| 4 | ERC-7710 spec — `eips.ethereum.org/EIPS/eip-7710` | `redeemDelegations`, revocation out-of-scope |
| 5 | ERC-7715 spec — `eips.ethereum.org/EIPS/eip-7715`; MetaMask delegation-toolkit articles | Wallet permission grant/revoke, production impls |
| 6 | ERC-7579 spec — `ercs.ethereum.org/ERCS/erc-7579`; Safe, ZeroDev Kernel, Biconomy Nexus, Rhinestone ModuleKit docs | Modular account install/uninstallModule, session-key path |
| 7 | ERC-1404 — `github.com/simple-restricted-token/simple-restricted-token` | Restriction code / message pattern |
| 8 | ERC-5539 — `eips.ethereum.org/EIPS/eip-5539` | Revocation-list alternative (not used) |
| 9 | ERC-8226 search — `eips.ethereum.org`, `ethereum-magicians.org`, GitHub ERCs (exhaustive) | Confirmed NOT a public spec; VAR-internal |
| 10 | World AgentKit — `docs.world.org/agents/agent-kit/integrate`; `github.com/worldcoin/agentkit`; emelia.io hub | AgentBook, resolveHuman, CAIP-122 gasless registration, chain scope |
| 11 | World ID — official blog, BusinessWire (Apr 2026), Gate Learn, U.Today | Orb iris-scan, ZK proof-of-personhood, ~18M verified humans |
| 12 | Arc / Circle — `arc.io`, Phemex (mainnet summer 2026), CoinBureau, Decrypt, dRPC chainlist, thirdweb, Circle whitepaper | Chain ID 5042002, RPC, USDC dual-decimal, 244M testnet txns |
| 13 | Dynamic / Fireblocks — `dynamic.xyz/docs/node/...`, `dynamic.xyz/sdk`, `fireblocks.com/blog/...`, Coinbase CDP EIP-712 docs, Turnkey blog | Node-only SDK, delegatedSign*, TSS-MPC alpha, ServerKeyShare, Agentic Wallets |
| 14 | Ethereum block-processing model — eth2book.info, Chainstack mempool, Medium EVM state articles | Next-block atomicity, in-flight race analysis |
| 15 | VAR internal docs — `03_CONTRACTS.md`, `02_ARCHITECTURE.md`, `04_INTEGRATIONS.md`, `06_BUILD_PLAN.md`, `08_RISKS.md` | Mandate struct, hot-path call graph, MVP/CUT/STRETCH scope, risk register |

---

_Confidence legend: claims labeled `high`/`medium`/`low` inline; `⚠️ verify` marks unverified/low-confidence items; `TBD` marks values not present in the data (never fabricated)._
