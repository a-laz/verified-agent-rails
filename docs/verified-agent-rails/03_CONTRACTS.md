# Smart Contracts

_The on-chain keystone of Verified Agent Rails (VAR) — build this first._

> **BUILD ORDER: This is the FIRST thing to build.** The contracts are the load-bearing wall. The agent loop, the grant/revoke UI, and the dashboard are all downstream of these signatures. Lock the interfaces here before anyone writes a line of TypeScript or Python. Everything else mocks against these until they exist.

The whole product reduces to one promise: **a token refuses to move unless the caller carries a valid Agent Passport under an unrevoked Mandate.** The check is a single on-chain VIEW call on the hot path — no paymaster, no relayer, no off-chain attestation. Revoke and, by the next block, the agent is dead.

The composition chain:

```
token transfer
  -> GatedToken.canTransfer(...)        [ERC-7943, Final]
       -> EligibilityResolver.isActiveForAmount(...)   [ERC-8226, Draft]
            -> AgentBook lookup (seeded from World ID proof-of-human)
```

Three view functions, one revert path, zero new trust assumptions.

> ⚠️ **POST-RESEARCH CORRECTIONS — read `09_RECONCILIATION.md`.** The overnight deep-research loop changed two load-bearing facts in this doc:
> 1. **ERC-8226 could not be verified as a published EIP.** VAR's `EligibilityResolver` is a **self-defined reference implementation**, not an interface to an existing spec — name it as ours for judges. (The `isActiveForAmount` shape below still holds, as VAR's own.)
> 2. **`getActivePrincipal` does not exist in ERC-8004** (only `getAgentWallet(agentId) → address`). Key the Mandate by **agent-wallet address**, store `principal` at grant, and revert on stored-vs-current mismatch.
>
> Also: **MVP uses per-transaction spend caps only** (D4) — the cumulative `spent` / `recordExecution` path is STRETCH (a state write breaks the one-VIEW-call invariant). And **`canTransfer` is a pure VIEW that MUST NOT revert** — the revert fires in the token's `_update` hook (§4, decision D10).

---

## 1. Contract Inventory

| Contract | Standard role | Status of basis | What it does | Build priority |
|----------|---------------|-----------------|--------------|----------------|
| **GatedToken** | ERC-7943 pre-transfer hook (`canTransfer`) | ERC-7943 **Final** | A demo ERC-20 whose every transfer calls `canTransfer`. Eligible transfers clear; others revert with a machine-readable reason. | P0 |
| **EligibilityResolver** | ERC-8226 eligibility resolver (`isActiveForAmount`) | ERC-8226 **Draft** ⚠️ verify | `canTransfer` delegates here. Validates the Mandate: cap, whitelist, expiry, revocation, and the World-ID anchor via AgentBook. | P0 |
| **AgentBook** | On-chain registry / mirror, seeded from World ID | World ID AgentKit / AgentBook | Resolves whether an agent wallet maps to a verified human. Anchors eligibility to proof-of-human. May be the live World AgentBook or a local mirror for the demo (see §5). | P0 |
| **PassportRegistry / Mandate store** | Holds Agent Passports + Mandates | ERC-8226 mandate lifecycle (`grantMandate`/`revokeMandate`) | Stores the signed, on-chain attestation (the Passport) and its scoped Mandate. Grant/revoke entry points the UI calls. Can be folded into `EligibilityResolver` or kept separate. | P0 |
| **YieldVault** (stub) | ERC-4626 tokenized vault | ERC-4626 | Minimal "park idle USDC for yield" target. Optional for the core demo; only needs `deposit`/`withdraw` shape. | P2 |

**Note on consolidation:** for a 36-hour build, `PassportRegistry` and `EligibilityResolver` can live in one contract — the registry holds Mandates and exposes `isActiveForAmount` over them. Keep `GatedToken` and `AgentBook` separate so the ERC-7943 surface and the proof-of-human anchor stay clean.

The hot-path call graph:

```
GatedToken.transfer(to, amount)
  └─ _beforeTokenTransfer / inline check
       └─ canTransfer(msg.sender→from, to, amount)            // ERC-7943, view
            └─ resolver.isActiveForAmount(agentId, principal, amount)  // ERC-8226, view
                 ├─ Mandate checks: cap / whitelist / expiry / revoked
                 └─ agentBook.resolveHuman(agentWallet) != 0   // World-ID anchor, view
```

Every hop is a `view`. No state writes on the read path. (Cumulative-cap accounting via `recordExecution` is the one write — see the gotcha in §5.)

---

## 2. The Mandate Struct

The Mandate is the scoped permission carried by a Passport: a spend cap, an asset whitelist, an expiry, and a kill switch. This struct is the contract's heart — get the field names right and the UI + agent loop fall out of it.

```solidity
struct Mandate {
    address human;          // verified principal (proof-of-human anchor; see AgentBook)
    address agent;          // the Dynamic-provisioned agent wallet acting on the human's behalf
    uint256 spendCap;       // max cumulative spend, in token's smallest unit (USDC: 6-decimal units)
    uint256 spent;          // STRETCH only (cumulative). MVP = per-tx caps (D4): omit/ignore this field. See 09_RECONCILIATION.md.
    address[] assetWhitelist; // tokens this agent may move/hold; empty = none allowed
    uint64  expiry;         // unix seconds; transfer reverts once block.timestamp >= expiry
    bool    revoked;        // human's kill switch — set true, next block the agent is dead
}
```

Notes:
- **`spendCap` units.** USDC on Arc exposes a 6-decimal ERC-20 interface; cap and `spent` are denominated in those 6-decimal units. Do **not** use the 18-decimal native interface for accounting — mixing decimals double-counts (Arc dual-decimal trap). Always read/transfer via the ERC-20 interface.
- **`assetWhitelist`.** For the demo this gates which tokens the agent may move (the GatedToken) and which yield instrument it may hold (the YieldVault share token). Empty whitelist = the agent can hold nothing.
- **`revoked` is the kill shot.** Setting it flips the next `isActiveForAmount` to `false`. No relayer, no off-chain step — the revocation is on-chain state read on the hot path.
- **`human` vs. AgentBook.** `human` is the principal recorded at grant time. The World-ID anchor (§5) independently confirms the agent wallet still resolves to a verified human. Both must agree.
- For ERC-8226 alignment, agents are addressed by a `uint256 agentId` (ERC-8004 identity). Either store `agentId` on the Mandate instead of / alongside `agent`, or resolve `agent → agentId` via the identity registry. **Proposed mapping; confirm against ERC-8226's exact `grantMandate` parameters — see claimsNeedingVerification.**

---

## 3. Interfaces

### 3.1 GatedToken — ERC-7943 `canTransfer` (Final, high confidence)

ERC-7943 is the Universal Real World Asset (uRWA) transfer-gating standard. For a fungible (ERC-20) token, the signature is fixed:

```solidity
// ERC-7943 (Final) — fungible token gating
function canTransfer(address from, address to, uint256 amount)
    external view returns (bool allowed);
```

Companion ERC-7943 view functions we may surface (all Final):

```solidity
function canSend(address account)    external view returns (bool);
function canReceive(address account) external view returns (bool);
```

`GatedToken` implements `canTransfer` and calls it inside its transfer path so a non-compliant transfer reverts atomically. We do **not** need `forcedTransfer` / `setFrozenTokens` for the core demo (they exist in ERC-7943 but are regulator-side tooling).

> ERC-7943's `canTransfer` is overloaded by token type: ERC-721 uses `(from, to, tokenId)`, ERC-1155 uses `(from, to, tokenId, amount)`. We ship the **ERC-20** shape only. Integration code must not assume one signature across types.

### 3.2 EligibilityResolver — ERC-8226 `isActiveForAmount` (Draft ⚠️ verify)

ERC-8226 is the Regulated Agent Mandate standard. The core resolver function, high confidence on signature:

```solidity
// ERC-8226 (Draft) — mandate + amount validation
function isActiveForAmount(uint256 agentId, address principal, uint256 amount)
    public view returns (bool);
```

Returns `true` iff the mandate is active **and** `amount` is within all defined transaction and cumulative limits. This is where the cap/whitelist/expiry/revoked logic lives (§5). `GatedToken.canTransfer` resolves the caller to `agentId` + `principal` and forwards here.

Mandate-lifecycle entry points (ERC-8226 names are high-confidence; **exact parameter lists are not pinned in the bundle — treat the bodies below as proposed**):

```solidity
// names per ERC-8226; parameters PROPOSED — confirm in spec
function grantMandate(/* principal, agentId, spendCap, assetWhitelist, expiry */) external;
function revokeMandate(/* agentId | mandateId */) external;
function extendMandate(/* agentId, newExpiry */) external;       // extends without resetting cumulative usage
function recordExecution(/* agentId, amount */) external;        // logs transfer, enforces cumulative cap (WRITE)
function isActive(/* agentId */) external view returns (bool);
// ⚠️ getActivePrincipal does NOT exist in ERC-8004 — only getAgentWallet(agentId)->address.
// VAR stores `principal` at grant and resolves locally; revert on stored-vs-current mismatch. See 09_RECONCILIATION.md.
function getAgentWallet(uint256 agentId) external view returns (address);  // ERC-8004 (real)
```

These power the UI's grant/revoke panel: **grant** = `grantMandate`, the kill shot = `revokeMandate`.

> **Eligibility ≠ identity.** Per ERC-8226, an agent merely *existing* in the identity registry is **not** proof of eligibility — eligibility is confirmed by an explicit compliance check. In VAR, that check is the AgentBook proof-of-human anchor (§5). `isActiveForAmount` returning `true` means: mandate active, amount within limits, **and** the agent still resolves to a verified human.

### 3.3 AgentBook — proof-of-human anchor lookup

AgentBook is the on-chain registry that links an agent wallet to one verified human (seeded by a World ID proof). The lookup we need on the hot path:

```solidity
// PROPOSED VAR-side interface over AgentBook — confirm exact World AgentBook ABI
interface IAgentBook {
    // returns the verified human's principal for an agent wallet, or address(0) if unregistered
    function resolveHuman(address agentWallet) external view returns (address human);
}
```

The bundle describes AgentBook registration (gasless, World App proof, CAIP-122 signed message) and that platforms resolve the registering human from AgentBook on-chain — but it does **not** give the exact resolver function name/signature. **Update (deep research): AgentBook appears to be a World _service_, not a canonical on-chain contract — so `resolveHuman(address) → address` is VAR's _own_ free design choice for the Arc-local mirror. Confirm from `@worldcoin/agentkit` source. See `09_RECONCILIATION.md`.** For the demo we may stand up a **local AgentBook mirror** seeded by a verified World ID proof (see §5) to keep the hot path a single view call.

World ID on-chain verification, when we seed the mirror ourselves, uses (high confidence):

```solidity
// World ID Router — used at seed time, NOT on the per-transfer hot path
function verifyProof(
    uint256 root,
    uint256 groupId,            // 1 for Orb credentials
    uint256 signalHash,         // keccak256(signal); bind signal = agent wallet address
    uint256 nullifierHash,      // track on-chain to prevent replay (one human, one anchor)
    uint256 externalNullifierHash,
    uint256[8] calldata proof
) external view;
```

Crucial: `verifyProof` does **not** itself prevent replay — our seeding contract must track `nullifierHash` in a mapping to enforce one-human-one-anchor. This happens **once at seed/registration time**, never on the transfer hot path.

---

## 4. Machine-Readable Revert Reasons (ERC-1404-style)

Failures must be debuggable by machines and humans alike. We use an **ERC-1404-style** restriction-code + human-string pattern, surfaced through the ERC-7943 / ERC-8226 revert path. A failing `canTransfer` returns `false`; the transfer wrapper then reads the reason code and reverts with both the code and a string.

```solidity
// ERC-1404-style restriction surface
function detectTransferRestriction(address from, address to, uint256 amount)
    external view returns (uint8 code);

function messageForTransferRestriction(uint8 code)
    external pure returns (string memory);
```

Proposed restriction codes for VAR (code 0 = success, by ERC-1404 convention):

| Code | Constant | Message | Triggered when |
|------|----------|---------|----------------|
| 0 | `OK` | `"Transfer allowed"` | All checks pass |
| 1 | `NO_PASSPORT` | `"Sender carries no Agent Passport"` | No Mandate found for the agent wallet |
| 2 | `MANDATE_REVOKED` | `"Mandate revoked by principal"` | `mandate.revoked == true` |
| 3 | `MANDATE_EXPIRED` | `"Mandate expired"` | `block.timestamp >= mandate.expiry` |
| 4 | `OVER_SPEND_CAP` | `"Amount exceeds remaining spend cap"` | `mandate.spent + amount > mandate.spendCap` |
| 5 | `ASSET_NOT_WHITELISTED` | `"Asset not permitted by mandate"` | token not in `mandate.assetWhitelist` |
| 6 | `NOT_VERIFIED_HUMAN` | `"Agent not anchored to a verified human"` | `agentBook.resolveHuman(agent) == address(0)` |

How it surfaces end-to-end:
- **On-chain:** the transfer reverts with `(code, message)` so a calling contract or `eth_call` simulation gets a structured reason.
- **Agent loop:** the backend agent reads the code, maps it to an action (e.g., `NO_PASSPORT` / `MANDATE_REVOKED` → stop and report; `OVER_SPEND_CAP` → halt spend), and boxes a structured status for the dashboard.
- **Demo arc:** the first "rejected, no passport" beat is literally code `1`; after revoke, the kill shot is code `2`.

The agent should call `detectTransferRestriction` (a view) **before** attempting the transfer, so it never burns gas on a doomed transaction and always has a clean reason to show.

---

## 5. Eligibility View Logic (pseudocode)

This is the body of `isActiveForAmount` — the single source of truth for "can this agent move this much of this asset right now." All reads; the only write in the system is `recordExecution` updating `spent`.

```text
function isActiveForAmount(agentId, principal, amount, asset) -> bool:

    m = mandates[agentId]                      // load the Mandate (the Passport's scope)

    # 1. Passport exists
    if m.human == address(0):
        return false                           # NO_PASSPORT (code 1)

    # 2. Not revoked  — the kill switch, checked first among scope rules
    if m.revoked:
        return false                           # MANDATE_REVOKED (code 2)

    # 3. Not expired
    if block.timestamp >= m.expiry:
        return false                           # MANDATE_EXPIRED (code 3)

    # 4. Within spend cap.  MVP per-tx (D4): use  if amount > m.spendCap.  STRETCH cumulative:
    if m.spent + amount > m.spendCap:
        return false                           # OVER_SPEND_CAP (code 4)

    # 5. Asset is whitelisted
    if asset not in m.assetWhitelist:
        return false                           # ASSET_NOT_WHITELISTED (code 5)

    # 6. World-ID anchor — agent still resolves to a verified human
    human = agentBook.resolveHuman(m.agent)
    if human == address(0) or human != m.human:
        return false                           # NOT_VERIFIED_HUMAN (code 6)

    return true                                # OK (code 0)
```

Design notes:
- **Order matters for the demo narrative.** Revocation is checked before cap/whitelist so the kill-shot beat returns the cleanest reason. (Order does not affect correctness — any failing check reverts.)
- **The anchor check is what gives "zero new trust assumptions."** Eligibility is not a new authority we invented; it bottoms out in World ID proof-of-human via AgentBook. We compose existing standards rather than minting trust.
- **Cumulative cap is the one stateful piece.** `m.spent` must be bumped via `recordExecution` on **every** agent transfer, or the cap can be bypassed. The pre-transfer check reads `spent`; the post-transfer (or in-transfer) `recordExecution` writes it. ⚠️ A partial/off-chain recording breaks the guarantee — keep `recordExecution` on-chain and atomic with the transfer.
- **`isActiveForAmount` signature in the bundle is `(uint256 agentId, address principal, uint256 amount)`** — it does **not** carry `asset`. The asset/whitelist check above is VAR-added; we either (a) bind the resolver to a single token, or (b) extend the signature. **Proposed `asset` parameter — confirm against ERC-8226; see claimsNeedingVerification.**
- **Principal resolution (corrected — deep research):** ERC-8004 exposes only `getAgentWallet(agentId) → address`; there is **no `getActivePrincipal`**. Store `principal` at grant time, re-resolve `agent → human` on every `isActiveForAmount`, and **revert on stored-vs-current mismatch** (catches wallet rotation). Key the Mandate by agent-wallet address (D9). See `09_RECONCILIATION.md`.

---

## 6. YieldVault — minimal ERC-4626 stub

After the agent pays, it sweeps idle USDC to a yield instrument the Mandate permits. For the demo this is a thin **ERC-4626** tokenized vault — just enough surface for the "park yield" step of the loop.

```solidity
// ERC-4626 stub — only what the park-yield step needs
interface IYieldVault {
    function asset() external view returns (address);                 // underlying = USDC
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
    function balanceOf(address account) external view returns (uint256 shares);
}
```

Scope notes:
- **Yield can be faked for the demo.** A stub that mints shares 1:1 and optionally accrues a token "interest" on a timer is sufficient. The point is to show the agent *parking permitted funds*, not to ship a real strategy.
- **Whitelist coupling.** The vault's share token (and/or the vault address) must be in the Mandate's `assetWhitelist`, or the sweep itself fails the eligibility check — which is the intended behavior: the Mandate, not the agent's code, decides what it may hold.
- **P2 priority.** Land GatedToken + EligibilityResolver + AgentBook + the grant/revoke flow first. The YieldVault is the last beat of the demo and the easiest to stub.

---

## Build checklist (this doc → code)

1. **GatedToken** (ERC-7943 `canTransfer`, ERC-20 shape) calling into the resolver. — P0
2. **EligibilityResolver / PassportRegistry** with the `Mandate` struct, `grantMandate`/`revokeMandate`, and `isActiveForAmount` body from §5. — P0
3. **AgentBook** lookup — live World AgentBook ABI **or** a local mirror seeded once via `verifyProof` (track `nullifierHash`). — P0
4. **ERC-1404-style** `detectTransferRestriction` / `messageForTransferRestriction` with the §4 code table. — P1
5. **YieldVault** ERC-4626 stub. — P2

Pin all signatures here before the agent loop or UI is written. The frontend grant/revoke panel and the backend check-eligibility/pay/park-yield loop both code against these names.
