# RWA / Permissioned-Token Compliance — Verified Agent Rails

_The compliance-token gate that turns one on-chain VIEW call into "accountability with one click."_

**Feasibility verdict: YES (build it).** Every load-bearing standard is live or Final — ERC-7943 (Final, May 27 2026), ERC-8004 (mainnet Jan 29 2026), World AgentKit/AgentBook (live), Arc testnet + USDC (live). The hot-path "single VIEW call" invariant holds. The two design forks that blocked earlier rounds are now **resolved and locked**: (1) the ERC-7943 "canTransfer MUST NOT revert" conflict → revert in the OZ-v5 `_update` hook, not in the VIEW; (2) the asset-binding signature mismatch → **explicit `asset` parameter (Pattern B)**. The one genuine caveat: **`ERC-8226` does not exist as a published EIP** — `isActiveForAmount` is a VAR reference implementation, so VAR owns that interface and its restriction-code enum. None of these are blockers for a 36h build.

---

## 1. The decision ledger (what is LOCKED)

| # | Decision | Resolution | Confidence |
|---|----------|------------|------------|
| D1 | Where does the machine-readable revert happen? | In `GatedToken._update` (OZ v5), **not** in `canTransfer` (ERC-7943 VIEW forbids reverts) | high |
| D2 | Asset binding for the resolver | **Pattern B** — explicit `asset` param: `isActiveForAmount(agentId, principal, amount, asset)`; one stateless resolver for all GatedTokens | high (cross-checked vs ERC-4626 `maxDeposit`) |
| D3 | Revert-reason encoding | ERC-1404-style `uint8` code (0–6 enum) + `messageForTransferRestriction`; OR ERC-6093 custom errors. Both machine-readable; pick one **per token** and ship its ABI | high |
| D4 | `ERC-8226` status | **Not a real EIP.** VAR defines `isActiveForAmount` as its own reference impl. Do not cite it as a published standard | high |
| D5 | Human-identity anchor | World ID proof seeds an **Arc-local AgentBook mirror** once at registration; hot path reads the mirror, never World Chain cross-chain | high (arch), medium (seeding ceremony) |
| D6 | Yield instrument | ERC-4626 vault, `maxDeposit(addr)→0` for non-whitelisted; **cuttable to a mock stub for MVP** | high |
| D7 | Settlement | USDC on Arc testnet (chain 5042002), 6-decimal ERC-20 interface only | high |

---

## 2. Hot-path architecture (the one VIEW call)

```
transfer(to, amount)
  └─ ERC20._update(from, to, amount)          ← OZ v5 override; THIS is where reverts are legal
       ├─ canTransfer(from, to, amount)        ← ERC-7943 VIEW, returns bool, MUST NOT revert
       │     └─ EligibilityResolver.isActiveForAmount(agentId, principal, amount, asset)
       │            ├─ AgentBook[agentId] lookup  (Arc-local mirror, seeded by World ID)
       │            ├─ mandate.expiryBlock / revoked / spendCap / assetWhitelist check
       │            └─ returns bool
       └─ if !allowed → revert <machine-readable reason>   ← ERC-1404 code or ERC-6093 error
```

**Invariant preserved.** The "single on-chain VIEW call" is `isActiveForAmount`. Everything it needs (agent→human mapping, mandate scope) lives on the **same chain** (Arc). No paymaster, no relayer, no off-chain attestation in the hot path. World ID verification and AgentBook seeding happen **once, off the hot path, at registration**.

**Cross-chain risk (Critical, mitigated).** AgentBook canonically lives on World Chain (`eip155:480`). If `canTransfer` runs on Arc, it has nothing local to read. Mitigation: deploy an Arc-local AgentBook mirror seeded from the World ID proof at registration, kept out of the hot path. ⚠️ verify: one-way revocation sync — if a human revokes on World Chain, the Arc mirror must be told. For the demo, revocation is performed directly against the Arc-local mandate/mirror so "next block" lockout is guaranteed. Multi-chain AgentBook replication (CCM / light client / Worldcoin multi-chain) is an open question for production (see §8).

---

## 3. The canonical interfaces (verified signatures)

### 3.1 ERC-7943 (uRWA) — Final, May 27 2026

The compliance core. Three VIEW eligibility functions + a forced-transfer admin path. **`canTransfer` MUST NOT revert and MUST NOT change storage** — it returns `false` instead. This is the spec constraint that drives D1.

```solidity
// All VIEW, all return bool. Fungible (ERC-20) variant has NO asset param —
// the contract IS the asset. (ERC-721 variant takes tokenId; ERC-1155 takes tokenId+amount.)
function canTransfer(address from, address to, uint256 amount) external view returns (bool allowed);
function canSend(address account) external view returns (bool allowed);
function canReceive(address account) external view returns (bool allowed);

// State-changing admin escape hatch (not hot path)
function forcedTransfer(address from, address to, uint256 amount) external returns (bool result);

// Four standard error types (MAY be used; custom errors also allowed)
error ERC7943CannotSend(address account);
error ERC7943CannotReceive(address account);
error ERC7943CannotTransfer(address from, address to, uint256 amount);
error ERC7943InsufficientUnfrozenBalance(address account, uint256 amount, uint256 unfrozen);
```

Source: <https://eips.ethereum.org/EIPS/eip-7943> (high). Final-status confirmation: GlobeNewswire May 27 2026 (high). Production adopters: **CMTAT/CMTA** (integrated ERC-7943 May 2026), **Chainlink ACE**, Brickken.

> Note the ERC-7943 standard errors carry **no restriction-reason code** (unlike ERC-1404). That gap is why VAR must define its own enum (§4).

### 3.2 OpenZeppelin v5 — the revert site

OZ v5 **removed** `_beforeTokenTransfer` / `_afterTokenTransfer`. The single customization point is now `_update`. All compliance reverts live here.

```solidity
function _update(address from, address to, uint256 amount) internal virtual; // override this
```

Source: OZ v5 changelog + PR #3838 (high). **Do not use `_beforeTokenTransfer`** — deprecated.

### 3.3 ERC-1404 — restriction-code surface (legacy, reused for D3)

```solidity
function detectTransferRestriction(address from, address to, uint256 value) external view returns (uint8);
function messageForTransferRestriction(uint8 restrictionCode) external view returns (string);
```

Codes are **issuer-defined** — code `0` = success is the only fixed convention. No cross-token registry exists. Source: <https://github.com/ethereum/EIPs/issues/1404>, <https://erc1404.org/> (high).

### 3.4 ERC-6093 — custom-error alternative for D3

Six ERC-20 errors (`ERC20InsufficientBalance`, `ERC20InvalidSender`, `ERC20InvalidReceiver`, `ERC20InsufficientAllowance`, `ERC20InvalidApprover`, `ERC20InvalidSpender`). Format = 4-byte keccak selector + ABI-encoded params; saves ~50 gas/revert vs string. **No compliance-specific errors** — VAR extends the pattern. Source: <https://eips.ethereum.org/EIPS/eip-6093> (high).

### 3.5 ERC-8004 — Trustless Agent identity (mainnet Jan 29 2026)

ERC-721-based agent registry. Use for agent identity layer; it does **not** carry on-chain asset whitelists (those are off-chain mandate scope).

```solidity
function getAgentWallet(uint256 agentId) external view returns (address);
// also: register(agentURI, metadata), setAgentWallet(agentId, newWallet, deadline, sig),
//       setMetadata / getMetadata
```

**Deployed addresses (Base):**
```
IdentityRegistry   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
ReputationRegistry 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
```
Source: <https://eips.ethereum.org/EIPS/eip-8004> (high). ⚠️ verify: `getActivePrincipal`/agent→principal resolution can return **stale data** if the agent wallet was recently rotated in the ERC-8004 registry — integration code must tolerate stale principal resolution and re-resolve defensively on every transfer (research-bundle gotcha, medium).

### 3.6 World ID `verifyProof` — used at AgentBook seed time only (NOT hot path)

```solidity
function verifyProof(
    uint256 root,
    uint256 groupId,            // 1 for Orb
    uint256 signalHash,         // keccak256(signal); signal = agentWalletAddress
    uint256 nullifierHash,      // MUST be tracked on-chain in a mapping to prevent replay
    uint256 externalNullifierHash,
    uint256[8] calldata proof
) external view;
```

`verifyProof` is a VIEW and does **not** itself prevent replay — VAR must store `nullifierHash` to enforce one-human-one-agent. Source: VAR CONTRACTS.md §3.3 (high).

### 3.7 `EligibilityResolver.isActiveForAmount` — VAR reference impl (D2/D4)

**This is NOT a published EIP.** VAR owns it. Pattern B (explicit asset param) is locked:

```solidity
// VAR-defined. Mirrors ERC-4626 maxDeposit(address) precedent for asset gating.
function isActiveForAmount(
    uint256 agentId,
    address principal,
    uint256 amount,
    address asset            // explicit — fungible ERC-7943 canTransfer carries no asset, so VAR adds it here
) external view returns (bool allowed);
```

⚠️ verify: an `IComplianceProvider` interface "used by ERC-8226 for principal eligibility" is referenced in VAR INTEGRATIONS.md §5 but **undefined** — VAR must define it or it does not exist (medium). Treat as TBD.

---

## 4. Machine-readable restriction codes (VAR-owned, D3)

**No standard registry exists** across ERC-1404 (issuer-defined) / ERC-3643 (plain strings) / ERC-7943 (no reason codes) / ERC-6093 (basic ERC-20 only) / ERC-8106 (off-chain `reasonHash`). VAR defines its own. Locked 6-code enum:

| Code | Name | Message |
|------|------|---------|
| 0 | `OK` | Transfer allowed |
| 1 | `NO_PASSPORT` | Sender carries no Agent Passport |
| 2 | `MANDATE_REVOKED` | Mandate revoked by principal |
| 3 | `MANDATE_EXPIRED` | Mandate expired |
| 4 | `OVER_SPEND_CAP` | Amount exceeds remaining spend cap |
| 5 | `ASSET_NOT_WHITELISTED` | Asset not permitted by mandate |
| 6 | `NOT_VERIFIED_HUMAN` | Agent not anchored to a verified human |

Surface via either path (ship the ABI either way so the agent-loop handler can decode deterministically):

**Path A — ERC-1404 uint8 (legacy-compatible):**
```solidity
function detectTransferRestriction(address from, address to, uint256 amount) external view returns (uint8 code);
function messageForTransferRestriction(uint8 code) external pure returns (string memory);
```

**Path B — ERC-6093-style custom error (gas-optimal, recommended):**
```solidity
error AgentComplianceViolation(address indexed from, address indexed to, uint256 amount, uint8 reason);
// or resolver-scoped:
error EligibilityResolver__MandateInvalid(address indexed agent, address indexed asset, uint8 reason);
```

⚠️ verify: confirm the custom-error path surfaces the `reason` code through `eth_call` simulation and ethers.js/viem custom-error decoding (frontend agent-loop handler). Test with the generated GatedToken ABI before relying on it.

---

## 5. Build-ready snippets

### 5.1 GatedToken `_update` — ERC-6093 custom-error path (recommended)

```solidity
error AgentInactive(address agent);
error MandateExpired(address agent, uint64 expiry);
error AssetNotWhitelisted(address asset);

function _update(address from, address to, uint256 amount) internal override {
    if (from != address(0)) {                                  // skip mints
        bool allowed = canTransfer(from, to, amount);          // ERC-7943 VIEW, never reverts
        if (!allowed) {
            // Hot path: single resolver VIEW already ran inside canTransfer.
            // Here we only branch on the specific reason for a machine-readable revert.
            if (!canSend(from))      revert AgentInactive(from);
            else if (!canReceive(to)) revert AgentInactive(to);
            else                      revert AgentInactive(from); // generic fallback
        }
    }
    super._update(from, to, amount);
}
```

### 5.2 GatedToken `_update` — ERC-1404 uint8 path (legacy fallback)

```solidity
function _update(address from, address to, uint256 amount) internal override {
    if (from != address(0)) {
        uint8 code = detectTransferRestriction(from, to, amount);
        if (code != 0) revert(messageForTransferRestriction(code));
    }
    super._update(from, to, amount);
}
```

### 5.3 Mandate struct (VAR-defined; AP2-aligned off-chain scope)

```solidity
struct Mandate {
    address human;          // verified-human principal (anchored via World ID → AgentBook)
    address agent;          // agent wallet (Dynamic-provisioned)
    uint256 spendCap;       // cumulative cap; see §8 spend-cap accounting caveat
    address[] assetWhitelist;
    uint64  expiryBlock;
    bool    revoked;        // one-click kill switch
}

interface IAgentMandate {
    function canMandateTransfer(address agent, address to, uint256 amount)
        external view returns (bool allowed, uint8 reason);
    function provisioned(address agent) external view returns (bool);
    function revokeMandate(address agent) external;        // demo climax: human calls this
    function updateSpendCap(address agent, uint256 newCap) external;
}
```

AP2 v0.2.0 off-chain mandate JSON (signed W3C VC the agent presents):
```json
{ "agentId": "...", "spendCap": 0, "assetWhitelist": ["0x..."],
  "expiryBlock": 0, "nonce": 0, "signature": { "v": 0, "r": "0x", "s": "0x" } }
```

---

## 6. Off-hot-path infrastructure (settlement, wallet, payments)

### Circle Arc (settlement chain) — LIVE testnet
```
RPC        https://rpc.testnet.arc.network
Chain ID   5042002   (testnet);  mainnet est. summer 2026, chain ID 1243 ⚠️ verify
USDC       0x3600000000000000000000000000000000000000
Faucet     https://faucet.circle.com
```
USDC is the native gas token. **Dual-decimal trap:** native is 18-decimal for gas, but the ERC-20 interface is 6-decimal — **use the 6-decimal ERC-20 interface only** for transfers or you double-count. Source: VAR INTEGRATIONS.md §3 + docs.arc.io (high). Arc has **no transaction-level compliance gating** of its own — VAR's GatedToken + resolver is orthogonal and deploys on top.

### Dynamic (agent-wallet provisioning) — Node-only SDK
```typescript
// @dynamic-labs-wallet/node-evm  (TypeScript/Node; NO Python SDK as of mid-2026)
const signedTx: string = await delegatedSignTransaction(client, {
  walletId, walletApiKey, keyShare, transaction
});
```
TSS-MPC signing latency ~5–10s (not sub-second). VAR backend is FastAPI/Python → **needs a Node sidecar HTTP bridge or subprocess**. ⚠️ verify: exact delegation-webhook payload shape (`walletId`, `walletApiKey`, `ServerKeyShare` fields) is low-confidence — confirm before wiring (medium).

### World ID / AgentBook (proof-of-human) — LIVE
AgentBook is **Worldcoin's** real on-chain registry on World Chain (`eip155:480`), seeded by Semaphore zero-knowledge World ID proofs (no PII on-chain), registered via **gasless hosted relay** (CAIP-122 signed message). It is **not** a VAR standard — VAR depends on the AgentKit SDK + relay. AgentKit launched March 6 2026 (`@worldcoin/agentkit` v0.1.5); ~21.5K agents registered by Jan 2026. World Chain Address Book: `0x57b930D551e677CC36e2fA036Ae2fe8FdaE0330D` (medium — related contract; specific AgentBook address TBD, pull from World docs). One-click revocation = human flags/deletes the agent entry → next transfer's resolver lookup fails → revert. **This is the demo climax mechanic.**

### x402 (stablecoin micropayments) — LIVE, optional for the "pay for a service" leg
HTTP 402 → agent signs USDC tx → server verifies → returns data. 119M txns on Base, ~$600M annualized, zero protocol fees; World ID integrated for agent-identity. Use for the agent's autonomous service-payment leg if desired.

---

## 7. What this unblocks for the build

- **Contracts can start at hour 0.** `GatedToken extends ERC20` (OZ v5) overriding `_update`; `EligibilityResolver` stateless with `isActiveForAmount(agentId, principal, amount, asset)`; `IAgentMandate` struct + `revokeMandate`. All signatures above are final.
- **One resolver, all tokens.** Pattern B means a single stateless `EligibilityResolver` serves every GatedToken on Arc — no per-asset resolver proliferation, shared mandate-verification logic, smaller attack surface.
- **Demo climax is a one-liner.** `mandate.revokeMandate(agent)` (or AgentBook flag) flips on-chain state synchronously; the very next block's `_update → canTransfer → isActiveForAmount` reads `revoked == true` and reverts with code `2 MANDATE_REVOKED`. "Accountability with one click," next-block lockout, no relayer.
- **Yield leg is cuttable.** ERC-4626 vault with `maxDeposit→0` gating is the real pattern, but a mock vault stub is sufficient to demo asset-whitelist enforcement (code `5`). Don't sink hackathon hours here.
- **Bounty alignment:** World ($15K proof-of-human) via World ID/AgentBook seed; Dynamic via agent-wallet provisioning (Node sidecar); Arc/Circle via USDC settlement on Arc testnet.
- **"Zero new trust assumptions" holds** in the hot path: one chain-local VIEW, no off-chain attestation, no paymaster/relayer at transfer time. The only relay (World ID registration) is one-time and off the hot path.

---

## 8. Residual open questions (ranked)

1. **Mandate-signature storage (gas-profile critical).** Is the signed AP2 mandate (a) in agent-wallet contract state (one read), (b) in transfer calldata (+~128 bytes, breaks ERC-20 transfer signature), or (c) held by the World ID relay (off-chain verify → breaks single-VIEW invariant)? Option (a) preserves the invariant. **Decide before coding the resolver.**
2. **Spend-cap accounting.** On-chain cumulative cap (code `4 OVER_SPEND_CAP`) requires a `recordExecution` **state write on every transfer** — that breaks the VIEW status of the gate. Either accept a write in `_update`, or downgrade spend-cap to advisory/off-chain. RISKS.md §8 confirms off-chain recording breaks the guarantee. **Pick: on-chain write vs advisory.**
3. **Nonce replay protection.** Where does the nonce live/increment — agent-wallet contract (write/transfer), resolver (shared cross-asset state, breaks VIEW), or off-chain (advisory)? Tied to Q1/Q2.
4. **Multi-chain AgentBook.** Production VAR on Arc + Base + World Chain needs AgentBook state on Arc. Options: Chainlink CCM (latency/trust), light client (complex), Worldcoin multi-chain mirror (added trust), off-chain API (breaks "zero new trust"). MVP sidesteps via one-time Arc-local seed. **Does Worldcoin offer multi-chain AgentBook?** (TBD)
5. **Revocation latency / gas.** Is the AgentBook/mandate revocation gasless via relay, or does the human pay gas? Demo narrative ("one click") needs gasless or near-instant. ⚠️ verify Worldcoin relay supports gasless revocation; otherwise reframe as "human initiates → agent locked out one block later."
6. **`IComplianceProvider`** for principal eligibility — referenced, undefined. Define it or drop it. TBD.
7. **Stale principal resolution** (ERC-8004 §3.5) — re-resolve agent→principal every transfer; confirm tolerance.
8. **Arc mainnet timing.** Testnet is live; mainnet "summer 2026"/chain 1243 unconfirmed. Will judges accept testnet-only? Fallback: Ethereum Sepolia + Arc testnet. ⚠️ verify chain ID 1243.
9. **`ERC-8226` publication.** Consider posting VAR's `isActiveForAmount` to Ethereum Magicians within hour 1 to signal intent — credibility with judges, positions for post-hackathon EIP.

---

## 9. Standards lineage (one-glance map)

| Standard | Status | Role for VAR | Reverts? | Reason codes? |
|----------|--------|--------------|----------|---------------|
| **ERC-7943** (uRWA) | **Final** 2026-05-27 | Hot-path compliance VIEW (`canTransfer`) | **No** (VIEW) | No |
| **ERC-1404** | Legacy | Restriction-code surface (D3 path A) | n/a (detect→revert in caller) | Yes (issuer-defined) |
| **ERC-6093** | Final | Custom-error encoding (D3 path B) | Yes (in caller) | ERC-20 only |
| **ERC-3643** (T-REX) | Established | Reference for claim/identity model; **not** used for errors (plain strings) | Yes (strings) | No |
| **ERC-8004** | Draft, mainnet live | Agent identity registry | — | — |
| **ERC-8106** | Draft | Off-chain `reasonHash` audit events (not pre-transfer gate) | No | Off-chain hash |
| **ERC-8196** | 2026 | Policy-bound wallet (action/contract/value bounds; no asset whitelist) | — | — |
| **ERC-4626** | Final | Yield vault + `maxDeposit→0` asset gating precedent (→ Pattern B) | n/a | n/a |
| **AP2** v0.2.0 | Live | Off-chain signed Mandate (assetWhitelist, spendCap) | n/a | n/a |
| **OAP v1.0** | Published 2026-03-07 | Off-chain W3C VC credential format (not on-chain) | n/a | n/a |
| **ERC-8226** | **DOES NOT EXIST** | VAR reference impl name for `isActiveForAmount` | — | — |
| **ONCHAINID** (ERC-734/735) | Established | Identity-claim model behind ERC-3643 | — | — |

---

## 10. Sources

- ERC-7943 (Final) — <https://eips.ethereum.org/EIPS/eip-7943> · Final-status: GlobeNewswire 2026-05-27
- ERC-1404 — <https://github.com/ethereum/EIPs/issues/1404> · <https://erc1404.org/>
- ERC-6093 — <https://eips.ethereum.org/EIPS/eip-6093>
- ERC-3643 (T-REX) — <https://eips.ethereum.org/EIPS/eip-3643> · <https://docs.erc3643.org/>
- ERC-8004 (Trustless Agents) — <https://eips.ethereum.org/EIPS/eip-8004> · <https://github.com/erc-8004/erc-8004-contracts>
- ERC-8106 — <https://eips.ethereum.org/EIPS/eip-8106>
- ERC-8196 — <https://eips.ethereum.org/EIPS/eip-8196>
- ERC-4626 — <https://eips.ethereum.org/EIPS/eip-4626> · Ondo USDY: <https://github.com/ondoprotocol/usdy>
- OpenZeppelin v5 `_update` — OZ v5 changelog · <https://github.com/OpenZeppelin/openzeppelin-contracts/pull/3838>
- World AgentKit / AgentBook — <https://docs.world.org/agents/agent-kit/integrate> · <https://github.com/worldcoin/agentkit> · World ID blog (AgentKit launch)
- AP2 Protocol — <https://agentpaymentsprotocol.info/> · <https://github.com/aporthq/aport-spec>
- Circle Arc — <https://www.arc.io/> · <https://docs.arc.io/> · testnet announcement
- x402 — <https://eco.com/support/en/articles/12328618-x402-protocol-explained-how-ai-agents-pay-onchain>
- Chainlink ACE — <https://blog.chain.link/automated-compliance-engine-technical-overview/> · <https://chain.link/automated-compliance-engine>
- CMTAT (ERC-7943 integration) — <https://github.com/CMTA/CMTAT/releases>
- ERC-8226 absence confirmed via search of eips.ethereum.org, GitHub ethereum/ERCs, Ethereum Magicians (no result)
- VAR internal docs — `docs/verified-agent-rails/{02_ARCHITECTURE,03_CONTRACTS,04_INTEGRATIONS,08_RISKS}.md`

_Confidence legend: claims without a flag are high-confidence (primary-source verified). ⚠️ verify = low/medium-confidence or self-flagged in VAR docs. TBD = no data; do not fabricate._
