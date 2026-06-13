# Security — Verified Agent Rails (VAR)

*Adversarial security audit of the gated-transfer composition (ERC-7943 / ERC-8226 / ERC-8004 + World ID + Dynamic + Arc).*

**Feasibility verdict:** PARTIAL → YES once Hour-0 locks land. The architecture is sound — the hot path is provably a single on-chain VIEW call (`token → canTransfer → isActiveForAmount → AgentBook`) with **zero new trust assumptions**. The kill-shot demo (grant → pay → revoke → next-block lockout) is achievable. But the build is **blocked on a handful of contract-design decisions** that the standards deliberately leave to the implementer, plus two outright spec mismatches (`ERC-8226` is not a published standard; `getActivePrincipal` does not exist in ERC-8004). Patch the five blockers below before writing Solidity and the system is build-ready hour 0.

---

## TL;DR for builders

| # | Threat / gap | Severity | Status | Where enforced |
|---|---|---|---|---|
| 1 | `ERC-8226` is **not a published standard** — `isActiveForAmount`/`grantMandate`/`recordExecution` are undefined | CRITICAL | Must self-define hour 0 | Resolver contract |
| 2 | `grantMandate` signature scheme unspecified → principal-impersonation bypass | CRITICAL | **LOCKED to EIP-712** (R4) | Resolver / AgentBook |
| 3 | `ERC-8004.getActivePrincipal` **does not exist** — only `getAgentWallet` | CRITICAL | Code must use `getAgentWallet` | Identity resolution |
| 4 | World ID `nullifierHash` replay NOT auto-prevented | HIGH | Must track on-chain | AgentBook seeding |
| 5 | `recordExecution` must be atomic per-transfer or cumulative cap is bypassable | HIGH | Token pre/post-transfer hook | GatedToken |
| 6 | ERC-7943 `canTransfer` MUST NOT revert — VAR's revert pattern is non-compliant | HIGH | **RESOLVED** (R5): bool + custom error | GatedToken |
| 7 | Revoke-block race (agent tx + revoke in same block) | MEDIUM | Accepted, documented | Mempool ordering |
| 8 | Stale principal after agent-wallet rotation | MEDIUM | Re-resolve, never cache | `isActiveForAmount` |
| 9 | Prompt injection at agent layer | MEDIUM | NOT contract-fixable | System-prompt + whitelist |
| 10 | Dual-decimal USDC double-counting (18 native vs 6 ERC-20) | HIGH | Use 6-dec ERC-20 only | Everywhere |
| 11 | Dynamic TSS-MPC closed alpha → custodial fallback | MEDIUM | Pitch risk only | Wallet provisioning |
| 12 | AgentBook Arc mirror not synced to World Chain upstream | MEDIUM | Accept as "seeded-once mirror" | Topology |

---

## 1. Spec reality check (verify these first — load-bearing)

### 1.1 ⚠️ ERC-8226 does not exist as a published standard
Exhaustive searches of `eips.ethereum.org`, `ethereum-magicians.org`, and `github.com/ethereum/ERCs` returned **zero** results for ERC-8226, `isActiveForAmount`, or `grantMandate` (R3, R5). Related real standards exist (ERC-8004, ERC-8118, ERC-8196) but none define the mandate surface. **The entire eligibility-resolver layer is internal/undefined.** VAR must either publish a Draft proposal immediately or own the implementation under a neutral name (e.g. `AgentMandateResolver`) with pinned semantics. This is the architectural load-bearing gap and blocks Lane A until signatures are locked. *(confidence: high)*

> Earlier rounds (R1/R2) treated ERC-8226 as a fetched "Draft" with concrete params. R3/R5 primary-source verification contradicts this. **Treat the ERC-8226 interface as VAR-owned, not externally guaranteed.** The signatures below are the *VAR-pinned* versions, not standards.

### 1.2 ✅ ERC-7943 — Final (safe, frozen)
- Status: **Final** (May 2026). `canTransfer` signature & behavior are immutable.
- `canTransfer` / `canSend` / `canReceive` are **pure view, MUST NOT revert**, MUST return `false` when a rule would block the transfer. Custom errors are *optional*. *(confidence: high — eips.ethereum.org/EIPS/eip-7943)*

### 1.3 ✅ ERC-8004 "Trustless Agents" — mainnet Jan 2026
- Defines `getAgentWallet(uint256 agentId) → address`. **`getActivePrincipal` does NOT exist** — VAR docs reference a non-existent function; runtime failure if called. Resolve principal via `getAgentWallet` + a local/AgentBook mapping. *(confidence: high)*
- On agent transfer, `agentWallet` auto-clears to zero and must be re-verified by the new owner → rotation staleness window. *(confidence: medium)*
- Early-adoption risk: ~5 months old at build time.

### 1.4 ✅ Supporting infra — verified live
- **World ID 4.0** (Mar 2026): `verifyProof` validates the proof but does **NOT** prevent `nullifierHash` reuse across app instances. *(high)*
- **Arc testnet**: Chain ID `5042002`, RPC live, USDC dual-decimal. *(high)*
- **Dynamic TSS-MPC**: sub-second signing (DKLs19 ECDSA), but **closed alpha** — access not guaranteed. *(high)*

---

## 2. Concrete artifacts (pinned interfaces)

### 2.1 ERC-7943 `canTransfer` (Final — never reverts)
```solidity
function canTransfer(address from, address to, uint256 amount)
    external view returns (bool allowed);
// MUST return false (not revert) when a rule blocks the transfer.
```
Source: eips.ethereum.org/EIPS/eip-7943 — confidence: high

### 2.2 ERC-8226-like resolver surface (VAR-OWNED — not a published standard)
```solidity
// Hot-path VIEW — the ONLY on-chain call in the gate
function isActiveForAmount(uint256 agentId, address principal, uint256 amount)
    external view returns (bool);

// WRITE — bumps cumulative spend; MUST be atomic with transfer
function recordExecution(uint256 agentId, address principal, uint256 amount)
    external;
```
Source: VAR-internal (no published ERC). ⚠️ verify — confidence: medium (signatures inferred, not standardized)

### 2.3 `grantMandate` — VAR variant, EIP-712 signed (LOCKED R4)
```solidity
function grantMandate(
    address human,
    uint256 agentId,
    uint256 spendCap,            // 6-decimal USDC units
    address[] calldata assetWhitelist,
    uint64 expiry,
    uint8 v, bytes32 r, bytes32 s
) external onlyOperatorOrHuman(agentId);
// Validates: ecrecover(mandateHash, v, r, s) == human
// Stores:    mandates[agentId] = Mandate(...)
// Emits:     MandateGranted(agentId, human, spendCap, expiry)
```
Source: VAR R4 lock — confidence: high (VAR-defined, not from a standard)

### 2.4 EIP-712 domain + Mandate struct (LOCKED R4)
```solidity
struct EIP712Domain {
    string  name;              // "VerifiedAgentRails"
    string  version;           // "1"
    uint256 chainId;           // 5042002 (Arc testnet); 1243 (Arc mainnet)
    address verifyingContract; // AgentBook / Resolver address — TBD at deploy
}

struct Mandate {
    address   human;
    address   agent;
    uint256   spendCap;        // 6-decimal USDC
    uint256   spent;           // cumulative; bumped by recordExecution
    address[] assetWhitelist;
    uint64    expiry;
    bool      revoked;
}

// keccak256("grantMandate(address human,address agent,uint256 spendCap,address[] assetWhitelist,uint64 expiry)")
bytes32 constant GRANT_MANDATE_TYPEHASH = 0x...; // TBD — compute at build

// Digest: keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash(mandate)))
```
Source: EIP-712 standard + VAR R4 lock — confidence: high

> **Gas option (R4, ⚠️ verify):** pass `scopeHash = keccak256(abi.encode(spendCap, assetWhitelist, expiry))` instead of the full struct on-chain. Only viable if the **full scope is in the signed digest** — otherwise scope is mutable post-signature (critical bypass). Decide before Lane A/C split.

### 2.5 ERC-8004 identity resolution (use these — NOT `getActivePrincipal`)
```solidity
function getAgentWallet(uint256 agentId) external view returns (address);

function setAgentWallet(
    uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature
) external; // proof-of-control; rotation source of staleness
```
Source: eips.ethereum.org/EIPS/eip-8004 — confidence: high

### 2.6 World ID router (replay NOT prevented on-chain)
```solidity
function verifyProof(
    uint256 root,
    uint256 groupId,             // 1 = Orb credentials
    uint256 signalHash,          // keccak256(agentWallet) — BINDS proof to agent
    uint256 nullifierHash,       // MUST track on-chain to prevent replay
    uint256 externalNullifierHash,
    uint256[8] calldata proof
) external view;
```
Source: World ID 4.0 + VAR INTEGRATIONS — confidence: high

### 2.7 Machine-readable rejection (RESOLVED R5) — ERC-7943 + ERC-1404 hybrid on GatedToken
```solidity
// GatedToken owns the ERC-1404-style code logic (NOT the resolver).
error TransferRestricted(uint8 code, string message);

function detectTransferRestriction(address from, address to, uint256 amount)
    external view returns (uint8 code);        // 0 = OK, 1..6 = reason
function messageForTransferRestriction(uint8 code)
    external view returns (string memory);

// transfer() flow:
//   1. bool ok = canTransfer(from, to, amount);          // ERC-7943, never reverts
//   2. if (!ok) {
//        uint8 c = detectTransferRestriction(from, to, amount);
//        revert TransferRestricted(c, messageForTransferRestriction(c));
//      }
// Lane B decodes the custom error via ethers.js custom-error ABI.
```
Source: VAR R5 decision + eips.ethereum.org/EIPS/eip-7943 — confidence: high.
This keeps `canTransfer` spec-compliant (bool, no revert) while delivering the ERC-1404-style "rejected, here's why" UX. GatedToken is therefore an **ERC-7943 + ERC-1404 hybrid** — legal, no standards conflict. Codes 0–6 from `03_CONTRACTS.md §4` are binding.

### 2.8 Nullifier tracking (one-time seeding, NOT hot path)
```solidity
mapping(uint256 nullifierHash => bool) public seenNullifiers;
mapping(address agentWallet => address human) public agentToHuman;

function seedAgentFromWorldID(
    address agentWallet,
    uint256 root, uint256 groupId, uint256 signalHash,
    uint256 nullifierHash, uint256 externalNullifierHash,
    uint256[8] calldata proof
) external {
    require(!seenNullifiers[nullifierHash], "Nullifier already used");
    worldIdRouter.verifyProof(root, groupId, signalHash, nullifierHash, externalNullifierHash, proof);
    seenNullifiers[nullifierHash] = true;
    agentToHuman[agentWallet] = msg.sender;   // anchor human → agent (1:1)
}

// Hot-path resolution: seeded once, never updated
function resolveHuman(address agentWallet) external view returns (address) {
    return agentToHuman[agentWallet];
}
```
Source: VAR CONTRACTS §3 + World ID spec — confidence: high

### 2.9 `recordExecution` for cumulative cap (atomic with transfer)
```solidity
function recordExecution(uint256 agentId, uint256 amount) external onlyGatedToken {
    Mandate storage m = mandates[agentId];
    require(!m.revoked, "Mandate revoked");
    require(block.timestamp < m.expiry, "Mandate expired");
    require(m.spent + amount <= m.spendCap, "Would exceed cap");
    m.spent += amount;
    emit ExecutionRecorded(agentId, amount, m.spent);
}
// Called by the GatedToken AFTER transfer succeeds (same tx); if it reverts,
// the whole transfer reverts. The agent NEVER calls this directly.
```
Source: VAR CONTRACTS §5 — confidence: high

### 2.10 Network / address constants
| Item | Value | Confidence |
|---|---|---|
| Arc testnet RPC | `https://rpc.testnet.arc.network` | high |
| Arc chain ID | `5042002` (mainnet expected `1243`) | high |
| Arc explorer | `https://testnet.arcscan.app` | high (⚠️ verify host) |
| Arc faucet | `https://faucet.circle.com` (test USDC for gas) | high |
| USDC contract | `0x3600000000000000000000000000000000000000` | high |
| USDC decimals | **6-decimal ERC-20** for ALL logic (18-dec native exists, do NOT mix) | high |
| ERC-8004 registry addr (Arc) | **TBD** — confirm live registry or deploy minimal ERC-721 | — |
| `GRANT_MANDATE_TYPEHASH` | **TBD** — compute at build | — |

---

## 3. Threat vectors (all 12 verified active)

### 3.1 grantMandate signature bypass — CRITICAL
The (VAR-owned) mandate layer delegates signature validation to the implementer. Naive `ecrecover(hash, v, r, s)` **without domain separation** means a captured principal signature is valid on any chain/contract, letting an attacker inject arbitrary mandate params (cap, whitelist, expiry). **Mitigation (LOCKED):** EIP-712 typed data, domain separator bound to `chainId` + `verifyingContract`; recover signer and require `== human`; **full scope must be in the signed digest** or scope is mutable post-signature. *(high)*

### 3.2 Nullifier replay — HIGH
`verifyProof` is view-only and does not block reuse. Without `seenNullifiers` tracking, one human's proof seeds multiple agent wallets, breaking the "one unique human" invariant. **Mitigation:** §2.8 mapping, reject on duplicate. Also bind `signalHash == keccak256(agentWallet)` so a proof for walletA cannot seed walletB (cross-use, distinct from replay). *(high)*

### 3.3 Cumulative-cap bypass via missing `recordExecution` — HIGH
Hot path reads `m.spent` (view) but never writes it. If recording is off-chain/partial/deferred, the counter stays stale and the agent exceeds the cap across multiple transfers. **Mitigation:** call `recordExecution` atomically in the token's transfer (revert all on failure). **MVP note:** if MVP uses per-tx caps only, `recordExecution` can be a no-op and `isActiveForAmount` stays pure-view — *decide hour 0*, it changes Lane A token design and Lane B error handling. *(high)*

### 3.4 ERC-7943 revert non-compliance — HIGH (RESOLVED)
Reverting inside `canTransfer` with `(code, string)` violates the Final spec and will fail token audits. **Resolved:** `canTransfer` returns bool; GatedToken maps `false →` `detectTransferRestriction` `→` `revert TransferRestricted(code, message)` (§2.7). *(high)*

### 3.5 Revoke-block race — MEDIUM
If the agent's transfer and the human's `revokeMandate` land in the same block, validator ordering decides; transfer-before-revoke clears against `revoked == false`. **Mitigations (any):** agent pre-flights `detectTransferRestriction` before signing; revoke uses priority gas; frontend orders revoke ahead of in-flight tx; or accept and **document**: "revoke is effective the *next* block, not the current one." Acceptable for 36h — same property as traditional revocation systems. **Demo:** narrate this explicitly. *(medium)*

### 3.6 Stale principal after rotation — MEDIUM
`setAgentWallet` rotation can orphan a mandate keyed by address, or `getAgentWallet` returns a freshly-rotated wallet that mismatches the mandate. **Mitigation:** re-resolve agent → principal on **every** `isActiveForAmount` call (defensive read, never cache); compare stored `mandate.human` vs current resolution, revert on mismatch. Open: key mandate by `agentId` vs `agent` address — **resolve hour 0**. *(medium)*

### 3.7 Prompt injection at agent layer — MEDIUM (NOT contract-fixable)
Real-world precedent: an AI wallet was drained ~\$150–200K via obfuscated (Morse-code) injected commands; the transfer was *within* the contract mandate (cap/whitelist) but against the human's intent (May 2026 Grok/Bankr incident). **The contract gates WHAT can move; it does not gate the agent's DECISION.** A prompt-injected agent attempting an out-of-mandate transfer is still blocked by `canTransfer` — that part is safe. The residual risk is *in-mandate but unwanted* spending. **Mitigations:** harden system prompt ("transfer only to pre-approved recipients; new address requires explicit human UI confirmation"), recipient whitelist, human approval above a threshold. *(high — vector real; not patchable in Solidity)*

### 3.8 Dual-decimal USDC double-counting — HIGH
Arc USDC shares one balance across an 18-decimal native interface and a 6-decimal ERC-20 interface (precompile parity). Reading balance via one and transferring via the other is off by `1e12`. A `spendCap` in 6-dec compared against an 18-dec balance allows enormous transfers. **Mitigation:** standardize on the **6-decimal ERC-20 interface everywhere** (`balanceOf`, `transfer`, `transferFrom`, `approve`); never call native USDC in the hot path; add a contract comment. Eliminates the whole error class. *(high)*

### 3.9 Dynamic TSS-MPC credential / alpha risk — MEDIUM
Delegation credentials (`walletApiKey` + `keyShare`) let the agent sign without re-approval — equivalent to a hot private key if stored plaintext. **Mitigation:** encrypt key shares at rest, secrets manager, rotate, audit logs. TSS-MPC is **closed alpha**; if access is denied, fall back to standard Dynamic embedded (custodial) wallets — compliance still holds (asset gate enforces it), but the "agent holds its own key" narrative weakens. Sub-second signing either way (budget 1–2s/sig in the demo). *(medium)*

### 3.10 AgentBook Arc-mirror staleness — MEDIUM
AgentBook is canonical on World Chain/Base; the gate lives on Arc. **Locked decision:** Arc-local mirror, seeded once from a World ID proof, is the source of truth thereafter (keeps the hot path a single *local* VIEW call — a cross-chain read would break the "one VIEW / zero new trust" invariant). Honest caveat: if World ID revokes the human upstream, the Arc mirror does **not** auto-update; only the on-chain `revoked=true` kill switch (human-driven) clears the agent. Frame as "seeded-once mirror," not a live bridge. *(medium)*

### 3.11 Identity-anchor cross-use (signal binding) — HIGH
Distinct from replay: even with nullifier tracking, if the seeding contract doesn't verify `signalHash == keccak256(agentWallet)`, a proof bound to walletA can seed walletB. **Mitigation:** enforce signal binding in `seedAgentFromWorldID`. *(high)*

### 3.12 Opaque `identityRef` / `scopeHash` semantics — HIGH (if using the 8226-style 8-param grant)
The fetched-but-unverified 8226 grant variant carried opaque `bytes32 identityRef` / `scopeHash` with no enforced meaning — nothing tied `identityRef` to a verified human, enabling ambiguous/conflicting scopes. **VAR's locked R4 grant drops these in favor of explicit fields** (`human`, `spendCap`, `assetWhitelist`, `expiry`), which sidesteps this — but if any 8226-shaped path survives, define `identityRef = nullifierHash` (or `keccak256(nullifier, agentWallet)`) and include scope in the signed digest. *(high)*

---

## 4. What this unblocks for the build

- **Lane A (Solidity)** can write `grantMandate` validation + EIP-712 recovery with no ambiguity — domain separator pinned (`name="VerifiedAgentRails"`, `version="1"`, `chainId=5042002`, `verifyingContract=` resolver). GatedToken rejection surface fully specified (§2.7).
- **Lane C (frontend)** can generate matching EIP-712 signatures client-side (`ethers.signTypedData`) **in parallel** with Lane A — the signature is the contract between them, now locked.
- **AgentBook seeding** is concrete: World ID (IDKit) → proof → `seedAgentFromWorldID` with nullifier tracking + signal binding → revert on duplicate.
- **Lane B (agent loop)** decodes `TransferRestricted(code, message)` via ethers.js custom-error ABI for the dashboard; pre-flights `detectTransferRestriction` to avoid wasted gas and surface clean reasons.
- **Demo beat order (R2/R4):** (1) grant w/o signature → revert; (2) grant w/ valid signature → stored; (3) agent pays → clears; (4) agent yield-sweep → clears (whitelisted); (5) human revokes → `revoked=true`; (6) agent pays next block → `TransferRestricted(2, "MANDATE_REVOKED")`. Optionally show step 6 same-block to call out the race honestly.

**Recommended Hour-0 build order:** lock EIP-712 signature → GatedToken + Resolver (Lane A) → AgentBook mirror seeding → grant/revoke UI (Lane C, parallel) → agent pay + `recordExecution` (Lane B). Do **not** parallelize contract + UI until the grant signature is locked (it lives on both sides).

---

## 5. Residual open questions

**Hour-0 blockers (resolve before Solidity):**
1. Is ERC-8226 a self-owned spec? If so, publish a Draft or rename to `AgentMandateResolver` — and confirm `isActiveForAmount` / `recordExecution` signatures are final.
2. **MVP cap model:** cumulative (requires atomic `recordExecution` write each transfer) or per-tx only (pure-view resolver)? Drives Lane A token design + Lane B error handling.
3. Confirm the agent→principal resolution path uses `getAgentWallet` (+ AgentBook mapping) — **not** the non-existent `getActivePrincipal`. Show how `m.agent` is populated from `agentId`.
4. AgentBook seeding path: on-chain `verifyProof` ceremony vs backend-verified-then-`grantMandate`? Affects Lane A complexity + Lane B routing.
5. Compute `GRANT_MANDATE_TYPEHASH`; finalize `verifyingContract` address; confirm full scope is in the signed digest (not just `scopeHash`).

**High:**
6. Does Dynamic TSS-MPC alpha access exist for this environment? If not, document custodial fallback and adjust the pitch.
7. Does Dynamic's signer support EIP-712 typed data, or only raw EIP-191? (Lane C grant panel depends on this.)
8. Confirm Dynamic delegation webhook payload field names/types (`walletId`, `walletApiKey`, key-share field) — marked low-confidence/inferred.
9. Is `spendCap` denominated in 6-decimal units throughout? (If any 18-dec path exists, the mandate struct is wrong.)

**Medium / demo:**
10. Authorized caller of `revokeMandate` / `extendMandate` — human only, or delegated operators? Multi-signer revoke in UI?
11. ERC-8004 registry on Arc: live mainnet registry, or deploy a minimal ERC-721? Need `register()` / `getAgentWallet()` addresses.
12. Are restriction codes 0–6 final, or open-ended (e.g. code 7 "caller not agent")? Reservation protocol?
13. Arc testnet RPC stability for a live demo — keep a forked/backup node ready, or pre-record the kill-shot tx and narrate over it?
14. Arc block time — can mempool ordering ever guarantee revoke-before-transfer in the same block? (Likely no; document.)
15. Yield-vault: core demo or cuttable? Affects `assetWhitelist` scope; mock vault if cut.
16. Does ethers.js (v5/v6) natively decode the `TransferRestricted` custom error, or does Lane C need a custom ABI parser?
17. Security narrative: name the threat vectors in the demo (credibility — judges will ask) vs gloss for polish? **Recommendation: name them** — glossing over cap accounting or signature validation tanks credibility.

---

## 6. Sources

| Source | Used for | Confidence |
|---|---|---|
| eips.ethereum.org/EIPS/eip-7943 | canTransfer Final behavior, MUST NOT revert, custom errors | high |
| eips.ethereum.org/EIPS/eip-8004 | `getAgentWallet`, `setAgentWallet`, rotation; **no `getActivePrincipal`** | high |
| eips.ethereum.org (search) / ethereum-magicians.org | **ERC-8226 absent** from published standards | high |
| globenewswire ERC-7943 Final announcement (May 2026) | ERC-7943 Final status | high |
| World ID 4.0 RFC (world.org/blog/engineering) + docs.world.org | nullifier replay not auto-prevented, OPRF one-per-context | high |
| docs.dynamic.xyz/wallets/mpc/overview + Dynamic MPC blog | TSS-MPC sub-second, DKLs19, closed alpha | high/medium |
| docs.arc.io contract-addresses + thirdweb.com/arc-testnet | Arc RPC, chain 5042002, USDC `0x3600…`, dual-decimal | high |
| faucet.circle.com | Arc test USDC | high |
| AI-wallet prompt-injection incident reports (ainvest.com, giskard.ai) | agent-layer prompt-injection vector, ~\$150–200K loss | high |
| simple-restricted-token (ERC-1404) repo | ERC-1404 restriction-code legacy pattern | high |
| VAR docs: 02_ARCHITECTURE.md, 03_CONTRACTS.md, 04_INTEGRATIONS.md, 08_RISKS.md, BUILD_PLAN.md | mandate struct, flows, locked decisions, risks | high (internal) |

> ⚠️ Items marked **TBD** (typehash, verifyingContract, ERC-8004 Arc registry address) and **⚠️ verify** (8226 signatures, scopeHash gas variant, explorer host) are not yet pinned to a primary source — do not fabricate; fill in at build time.
