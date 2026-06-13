# Yield Leg — Verified Agent Rails Research

_Parking idle USDC in a Mandate-permitted yield instrument: the last beat of the agent loop, gated by one on-chain view call._

**Feasibility verdict: FEASIBLE (high confidence) for the 36h build.** The yield leg plugs into VAR with zero new hot-path calls. Ship a 1:1 ERC-4626 stub vault (~100 LOC, all 16 functions, trivial `max*`/`preview*`), whitelist the vault **share token** in `Mandate.assetWhitelist` (Pattern B), and let the existing `isActiveForAmount` view gate the deposit/withdraw sweep. Real yield venues exist on Arc testnet (USYC, live) and post-hackathon (Aave V4, governance-pending) but are **not** demo dependencies — the stub is strictly safer. One correction to lock in: **ERC-8226 does not exist** as a published Ethereum standard (verified across 5 rounds); the resolver is a VAR-owned custom contract, not a Draft EIP.

---

## 1. What this unblocks for the build

| Decision | Locked answer | Confidence |
|----------|---------------|------------|
| **Yield vault interface** | ERC-4626 (Final, Apr 2022). All 16 functions REQUIRED for compliance; stub may use trivial `max*`/`preview*`. | high |
| **Demo vault** | 1:1 stub ERC-4626 backed by Arc USDC. NOT real USYC (entitlements may silently block agent wallet). | high |
| **Whitelist encoding** | Pattern B — `Mandate.assetWhitelist` holds the **vault SHARE token** address only. Underlying USDC never appears. | high |
| **Hot-path gate** | Single `isActiveForAmount(...)` VIEW call inside `vault.deposit`. No paymaster, no relayer, no off-chain attestation. | high |
| **Resolver standard** | ERC-8226 **does not exist** — VAR-custom `EligibilityResolver`. Follow ERC-8004 (identity) + ERC-1404 (reason codes) patterns. | high |
| **Yield math** | None needed. 1:1 share/asset; optional fake interest on a timer. Demo proves "park permitted funds," not a real strategy. | high |
| **Sweep cap units** | USDC 6-decimal ERC-20 interface ONLY. Never the 18-decimal native (gas) interface — mixing double-counts (Arc dual-decimal trap). | high |
| **Priority** | P2 — land GatedToken + EligibilityResolver + AgentBook + grant/revoke first. Vault is the last, easiest beat to stub. | high |

---

## 2. Concrete artifacts

### 2.1 ERC-4626 required interface (the surface the vault must expose)

ERC-4626 is **Final** (finalized April 2, 2022; authors Joey Santoro, transmissions11, Jet Jadeja). Per spec, **all 16 functions are REQUIRED** — `max*`/`preview*` are NOT optional. A stub satisfies them with trivial logic.

```solidity
// Required ERC-4626 surface (all 16; *-marked can be trivial in a 1:1 stub)
function asset()        external view returns (address);                                    // underlying = USDC
function totalAssets()  external view returns (uint256);                                    // = asset.balanceOf(vault)
function deposit(uint256 assets, address receiver)               external returns (uint256 shares);
function mint(uint256 shares, address receiver)                  external returns (uint256 assets);
function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
function redeem(uint256 shares, address receiver, address owner)  external returns (uint256 assets);
function convertToShares(uint256 assets) external view returns (uint256);                   // 1:1 → returns assets
function convertToAssets(uint256 shares) external view returns (uint256);                   // 1:1 → returns shares
function maxDeposit(address)   external view returns (uint256);  // * trivial: type(uint256).max
function maxMint(address)       external view returns (uint256); // * trivial: type(uint256).max
function maxWithdraw(address owner) external view returns (uint256); // balanceOf(owner)
function maxRedeem(address owner)   external view returns (uint256); // balanceOf(owner)
function previewDeposit(uint256 assets) external view returns (uint256);  // * trivial: assets
function previewMint(uint256 shares)    external view returns (uint256);  // * trivial: shares
function previewWithdraw(uint256 assets) external view returns (uint256); // * trivial: assets
function previewRedeem(uint256 shares)   external view returns (uint256); // * trivial: shares
// + events: Deposit(caller, owner, assets, shares), Withdraw(caller, receiver, owner, assets, shares)
```

> The VAR `03_CONTRACTS.md` §6 `IYieldVault` interface lists only `asset/deposit/withdraw/balanceOf` — that is the **agent's call surface**, not the full compliant ABI. The deployed contract must still implement all 16 for spec compliance and clean Mandate-oracle integration. Emit the full `Deposit`/`Withdraw` events (required; helps the dashboard). _Source: eips.ethereum.org/EIPS/eip-4626 (high)._

### 2.2 Minimal 1:1 stub vault (demo-ready, ~100 LOC)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StubVault is ERC20 {
    IERC20 public immutable _asset;            // underlying USDC (Arc 6-decimal ERC-20 interface)
    constructor(IERC20 a) ERC20("VAR Vault Shares", "vUSDC") { _asset = a; }

    function asset() external view returns (address) { return address(_asset); }
    function totalAssets() public view returns (uint256) { return _asset.balanceOf(address(this)); }

    function deposit(uint256 assets, address receiver) external returns (uint256) {
        _asset.transferFrom(msg.sender, address(this), assets);
        _mint(receiver, assets);               // 1:1
        emit Deposit(msg.sender, receiver, assets, assets);
        return assets;
    }
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256) {
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, assets);
        _burn(owner, assets);
        _asset.transfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, assets, assets);
        return assets;
    }
    function mint(uint256 shares, address receiver) external returns (uint256) {
        _asset.transferFrom(msg.sender, address(this), shares);
        _mint(receiver, shares); return shares;
    }
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256) {
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);
        _burn(owner, shares); _asset.transfer(receiver, shares); return shares;
    }
    // trivial views (1:1, no fees)
    function convertToShares(uint256 a) external pure returns (uint256) { return a; }
    function convertToAssets(uint256 s) external pure returns (uint256) { return s; }
    function maxDeposit(address) external pure returns (uint256) { return type(uint256).max; }
    function maxMint(address) external pure returns (uint256) { return type(uint256).max; }
    function maxWithdraw(address o) external view returns (uint256) { return balanceOf(o); }
    function maxRedeem(address o) external view returns (uint256) { return balanceOf(o); }
    function previewDeposit(uint256 a) external pure returns (uint256) { return a; }
    function previewMint(uint256 s) external pure returns (uint256) { return s; }
    function previewWithdraw(uint256 a) external pure returns (uint256) { return a; }
    function previewRedeem(uint256 s) external pure returns (uint256) { return s; }

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
}
```
_Source: OpenZeppelin ERC4626 reference + eips.ethereum.org/EIPS/eip-4626 (high). Inflation-attack mitigation (virtual offset) is unnecessary for a 1:1 demo stub but mandatory for any real vault._

### 2.3 Whitelist encoding — **Pattern B (LOCKED)**

`Mandate.assetWhitelist` encodes the **vault SHARE token address ONLY**. The underlying USDC never appears in the whitelist.

| Pattern | What's whitelisted | Verdict |
|---------|-------------------|---------|
| A | underlying USDC + share token separately | ❌ dual permit chain, complex cap tracking |
| **B** | **share token only** | ✅ **CHOSEN** — single permit, one VIEW call, cleanest semantics |
| C | underlying only, gate via `vault.maxDeposit` | rejected — less delegation-like, leaks USDC transfer rights |

Semantics: "agent is permitted to hold this vault's shares" == "agent may park idle USDC here." `agent → vault.deposit(usdc, agent)` transfers USDC internally; the share-token mint triggers the ERC-7943 `canTransfer` hook → which delegates to `isActiveForAmount` → which checks the share token is in `assetWhitelist`. One view call, no second permit. _Confidence: high (locked Round 4, re-verified Round 5)._

> ⚠️ **Open inside VAR contracts:** `03_CONTRACTS.md` §6 also allows "the vault address" in the whitelist as an alternative to the share token. For a stub where the vault contract IS the share-token ERC-20, these are the same address — no conflict. Confirm they remain unified before contract lock.

### 2.4 Hot-path gate (deposit/withdraw is itself a gated transfer)

```text
agent.vault.deposit(usdcAmount, agent)
   └─ StubVault._mint(agent, shares)
        └─ ERC-7943 canTransfer(address(0)→agent, shares)   [share token, Final]
             └─ EligibilityResolver.isActiveForAmount(agentId, agent, shares, SHARE_TOKEN)  // VIEW, ERC-8226-pattern
                  ├─ mandate exists / !revoked / !expired / spent+amt<=cap
                  ├─ SHARE_TOKEN ∈ assetWhitelist
                  └─ AgentBook.resolveHuman(agent) == mandate.human
   revert path: false → detectTransferRestriction → ERC-1404 code+message
```

This reuses the **exact same** eligibility check as a normal `GatedToken.transfer`. No new hot-path call is introduced by the yield leg. The revocation kill-shot (set `mandate.revoked = true`) flips the next deposit/withdraw to revert in the next block. _Source: VAR 03_CONTRACTS.md §5 + ERC-7943/ERC-4626 integration (high)._

### 2.5 Resolver signature (VAR-custom; ERC-8226 does not exist)

```solidity
// EligibilityResolver — VAR custom. NOT a published EIP.
function isActiveForAmount(uint256 agentId, address principal, uint256 amount, address asset)
    external view returns (bool);
```

> ⚠️ **Signature reconciliation needed.** `03_CONTRACTS.md` §5 notes the "bundle" signature is `(uint256 agentId, address principal, uint256 amount)` with `asset` as a VAR addition (bind-to-single-token OR extend signature). Since ERC-8226 does not exist, there is **no external standard to conform to** — VAR owns the signature outright. Recommend committing to the 4-arg form with `asset` so the same resolver gates both the GatedToken and the vault share token. _Confidence: high that ERC-8226 is absent; the signature itself is VAR-internal._

### 2.6 Mandate struct (canonical — matches 03_CONTRACTS.md §3)

```solidity
struct Mandate {
    address human;            // World-ID-verified principal (zero = no passport)
    address agent;            // agent wallet
    uint256 spendCap;         // cumulative cap, USDC 6-decimal units
    uint256 spent;            // running total (the ONE stateful piece; recordExecution writes it)
    address[] assetWhitelist; // share-token addresses (Pattern B); empty = hold nothing
    uint64  expiry;           // unix ts; >= expiry → revert
    bool    revoked;          // human kill switch; true → next isActiveForAmount false
}
```
_Source: VAR 03_CONTRACTS.md §3 (high). Field order/names are a cross-contract + dashboard contract — do not reorder._

### 2.7 ERC-1404-style restriction codes (revert reasons)

The vault sweep surfaces failures through the same code table as every other transfer:

| Code | Constant | Triggered when |
|------|----------|----------------|
| 0 | `OK` | all checks pass |
| 1 | `NO_PASSPORT` | no Mandate for agent wallet |
| 2 | `MANDATE_REVOKED` | `revoked == true` (the kill shot) |
| 3 | `MANDATE_EXPIRED` | `block.timestamp >= expiry` |
| 4 | `OVER_SPEND_CAP` | `spent + amount > spendCap` |
| 5 | `ASSET_NOT_WHITELISTED` | share token not in `assetWhitelist` |
| 6 | `NOT_VERIFIED_HUMAN` | `agentBook.resolveHuman(agent) == address(0)` |

```solidity
function detectTransferRestriction(address from, address to, uint256 amount) external view returns (uint8);
function messageForTransferRestriction(uint8 code) external view returns (string memory);
```
_Source: VAR 03_CONTRACTS.md §4 + ERC-1404 (github.com/ethereum/EIPs/issues/1404) (high). Agent should call `detectTransferRestriction` (view) BEFORE the sweep so it never burns gas on a doomed tx._

---

## 3. On-chain addresses & infra (Arc testnet, chainId 5042002)

> ⚠️ **All addresses are Arc TESTNET.** Arc docs explicitly state mainnet addresses are not yet published and there is **no backward-compat guarantee**. Pin testnet for the hackathon. Mainnet target: summer 2026.

| Item | Value | Confidence | Source |
|------|-------|------------|--------|
| Chain ID | `5042002` | high | docs.arc.io / chainlist.org/chain/5042002 |
| **USDC** (native, dual-decimal) | `0x3600000000000000000000000000000000000000` | high | docs.arc.io/arc/references/contract-addresses |
| — decimals | **6-dec ERC-20 interface** (transfers/balanceOf/approve); 18-dec native = gas only | high | arc.io/blog/building-with-usdc-on-arc |
| **USYC** (Hashnote yield token, permissioned) | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | high | usyc.docs.hashnote.com / testnet.arcscan.app |
| **USYC Entitlements** | `0xcc205224862c7641930c87679e98999d23c26113` | high | usyc.docs.hashnote.com/overview/smart-contracts |
| USYC Entitlements (alt addr reported R4) | `0x7f44c5F5551ed651F7298367Ee51f1CBa608571b` ⚠️ verify | medium | usyc.docs.hashnote.com (conflicting across rounds) |
| RPC (official) | `https://rpc.testnet.arc.network` | high | docs.arc.io |
| RPC (dRPC) | `https://arc-testnet.drpc.org` | high | drpc.org/chainlist/arc-testnet-rpc |
| Faucet | `https://faucet.circle.com` | high | arc.io blog |
| Explorer | `https://testnet.arcscan.app` | high | docs.arc.io |

> ⚠️ Two different USYC Entitlements addresses appear across rounds (`0xcc2052…` and `0x7f44c5…`). Do not rely on either for the demo — the stub vault bypasses entitlements entirely. Verify against live Arc docs only if real USYC integration is attempted.

**USDC dual-decimal trap (critical):** one token, two synced balances. `usdc.transfer(to, 5_000_000)` moves 5 USDC (6-dec). All `spendCap`/`spent`/sweep arithmetic MUST use 6-decimal units. Mixing the 18-decimal native interface double-counts. _Source: arc.io/blog/building-with-usdc-on-arc-one-token-two-interfaces (high)._

---

## 4. Standards landscape (verified)

| Standard | Status | Relevance to yield leg | Confidence |
|----------|--------|------------------------|------------|
| **ERC-4626** Tokenized Vault | **Final** (Apr 2022), ~$25B TVL | The vault interface. Stub or real wrapper. | high |
| **ERC-7943** uRWA `canTransfer` | **Final** (May 27, 2026) | Compliance hook on the share token; delegates to resolver. Sig: `canTransfer(from,to,amount) view→bool`. Also `canSend`/`canReceive`. MUST return false (not revert) on violation. | high |
| **ERC-1404** Restricted Token | issue/ERC | Machine-readable revert codes for the dashboard. | high |
| **ERC-8004** Trustless Agents | **Draft**, mainnet contracts live Jan 29 2026 | Identity/Reputation/Validation registries. Pattern reference for AgentBook + resolver. Defines `setAgentWallet`, `register`, `validationResponse`. Does NOT define mandate logic. ⚠️ Draft = interface-breakage risk. | high |
| **ERC-8183** Agentic Commerce | proposed Feb 25 2026 | Escrow lifecycle (Open→Funded→Submitted→Completed). Evaluator-gated; parallels human-as-evaluator revocation model. Not required for yield leg. | high |
| **ERC-8226** Agent Mandate | **DOES NOT EXIST** | ⚠️ Confirmed absent across all 5 research rounds (EIPs repo, Magicians, web). VAR's `isActiveForAmount` is custom. | high |
| ERC-7540 / ERC-7575 | async / multi-asset 4626 extensions | Out of scope for demo; relevant only for real async RWA vaults (e.g. Centrifuge). | medium |
| ERC-7710 / ERC-7715 | delegation / permission request | Alternative mandate pattern (MetaMask Delegation Toolkit). Asset whitelist NOT standardized there either. Reference only. | high |

**USYC reality check:** USYC is a **permissioned ERC-20**, NOT ERC-4626. It is a tokenized money-market fund (Hashnote / Circle International Bermuda; Cayman fund backed by short-duration US Treasuries + reverse repos; ~$1.6B AUM Jan 2026; yield ~4–6% via rising price). Transfers/holds are gated by an Entitlements contract (OFAC/Chainalysis screening, KYC allowlist, $100k+ min, non-US institutions). **Non-allowlisted wallets fail silently.** Wrapping it in a 4626 adapter requires Hashnote/Circle to allowlist the adapter (24–48h via Circle Support) — a critical-path risk for a 36h build. **Use the stub.** _Sources: usyc.docs.hashnote.com (high)._

**Aave V4 on Arc:** governance Temp Check (May 29, 2026), DAO snapshot ~52.58% in favor as of Jun 9 — **split, not approved.** Initial scope USDC/EURC/cirBTC, $2M/yr min revenue to Aave DAO, summer-2026 mainnet target. **NOT live on testnet, NOT a demo dependency.** A real post-hackathon yield venue if the vote passes; no Mandate changes needed to add it as another whitelisted vault later. _Source: cryptorank.io / cryptopolitan (high)._

**World ID / AgentKit (the trust anchor):** AgentKit launched Mar 17, 2026 (World + Coinbase). Human Orb-verifies once → ZK proof of unique human (no PII/biometric leakage) → delegates a scoped credential to the agent wallet. Revocation is biometrically anchored and one-click from the phone. Registration: `npx @worldcoin/agentkit-cli register <wallet>` → World App proof → on-chain registration via CAIP-122 message (gasless relay on World Chain/Base). **`resolveHuman` ABI is not inlined in public repos** — likely `resolveHuman(address agent) → address human` following an ERC-721 + mapping pattern; confirm by repo inspection or a test call. _Sources: world.org/blog, coindesk (high); resolveHuman signature **TBD** (medium)._

---

## 5. Residual open questions

1. **`resolveHuman` exact signature** — `(address human)` or `(address human, bool isActive)`? Not documented in `worldcoin/agentkit`. Resolve by ABI inspection or a World Chain test call before AgentBook lock. ⚠️ verify.
2. **AgentBook cross-chain resolution** — AgentBook (World ID anchor) is **not** an official Circle/World product. For the demo, seed a local mock AgentBook on Arc testnet (manual/server-side seeding from the World ID proof — MVP), or mirror World Chain/Base via CCTP + attestation oracle (STRETCH). Decision pending.
3. **On-chain vs server-side World ID verify** — `03_CONTRACTS.md` §5 / `06_BUILD_PLAN.md` mark on-chain `verifyProof` as CUT-to-STRETCH; server-side IDKit verify is the MVP fallback. Confirm committed path.
4. **`isActiveForAmount` arity** — commit to 4-arg (`+asset`) since ERC-8226 imposes no external constraint. Update `03_CONTRACTS.md` §5 note (currently flags it as "confirm against ERC-8226," which cannot be confirmed against a nonexistent standard).
5. **Spend-cap semantics for the sweep** — Pattern B whitelists the share token, so is the cap denominated in USDC-equivalent or share-amount? At 1:1 they coincide for the stub; lock the rule before any non-1:1 vault. Also: cumulative-cap `recordExecution` is the only state write — keep it on-chain and atomic with the transfer, or the cap is bypassable (per §5 note).
6. **Sweep trigger** — agent-autonomous (e.g. dust > 1 USDC every hour) vs human-click. Autonomous needs rate-limiting/time-lock in the Mandate. Demo assumption: human-triggered.
7. **Min ERC-4626 surface for the oracle** — confirm the Mandate oracle never calls a `preview*`/`max*` it expects nontrivial; stub returns trivial values, which is spec-legal but could surprise an integrator.
8. **USYC entitlements ownership** — if real USYC is ever attempted, who requests allowlisting (24–48h)? Critical-path item; avoid for the demo.
9. **Dynamic SDK signing** — Dynamic agent-wallet SDK is Node-only (no confirmed Python SDK). FastAPI backend likely needs a Node sidecar or HTTP wrapper for `delegatedSignTransaction`. Confirm before backend arch lock. ⚠️ verify.
10. **CCTP** — CCTP V2 live on 13+ chains (V1 deprecates Jul 31, 2026); burn-mint native USDC, no wrapped tokens. Useful to fund the Arc agent wallet, but the testnet faucet may suffice for the full demo (grant + payments + sweep). Confirm faucet sufficiency.

---

## 6. Sources

| # | Source | Used for | Confidence |
|---|--------|----------|------------|
| 1 | https://eips.ethereum.org/EIPS/eip-4626 | ERC-4626 Final, 16 required functions, signatures | high |
| 2 | https://github.com/OpenZeppelin/openzeppelin-contracts (ERC4626.sol) | Reference impl, stub override pattern, inflation mitigation | high |
| 3 | https://eips.ethereum.org/EIPS/eip-7943 | `canTransfer`/`canSend`/`canReceive` Final (May 27 2026) | high |
| 4 | https://github.com/ethereum/EIPs/issues/1404 | ERC-1404 restriction-code pattern | high |
| 5 | https://eips.ethereum.org/EIPS/eip-8004 | Agent identity/validation registry patterns | high |
| 6 | https://eips.ethereum.org/EIPS/eip-8183 | Agentic commerce escrow lifecycle (revocation analogy) | high |
| 7 | https://docs.arc.io/arc/references/contract-addresses | Arc testnet USDC, addresses, chainId, testnet-only caveat | high |
| 8 | https://arc.io/blog/building-with-usdc-on-arc-one-token-two-interfaces | USDC dual-decimal trap | high |
| 9 | https://usyc.docs.hashnote.com/overview/smart-contracts | USYC token + entitlements addresses, permissioning | high |
| 10 | https://usyc.docs.hashnote.com/overview/product-structuring | USYC fund structure, yield source, KYC gating | high |
| 11 | https://cryptorank.io/news/... / cryptopolitan.com (Aave V4 on Arc) | Aave V4 Temp Check, 52.58% support, summer-2026 target | high |
| 12 | https://world.org/blog/announcements/now-available-agentkit-... | World ID AgentKit, proof-of-human, revocation model | high |
| 13 | https://www.coindesk.com/tech/2026/03/17/... | World + Coinbase AgentKit launch | high |
| 14 | https://www.circle.com/cross-chain-transfer-protocol | CCTP V2 chains, burn-mint, V1 deprecation | high |
| 15 | https://www.circle.com/pressroom/circle-launches-arc-public-testnet | Arc testnet launch, ecosystem (Centrifuge/Superform/Securitize) | medium |
| 16 | https://chainlist.org/chain/5042002 + drpc.org | RPC endpoints, chainId | high |
| 17 | C:\Users\leech\agent-stack-template\docs\verified-agent-rails\03_CONTRACTS.md | Canonical Mandate struct, resolver pseudocode, restriction codes, IYieldVault | high |
| — | ERC-8226 search (eips.ethereum.org, ethereum-magicians.org, web) | **Confirmed: no such standard exists** | high |
| — | `resolveHuman` ABI | Not in public repos — **TBD / ⚠️ verify** | low |
| — | VAR `EligibilityResolver.isActiveForAmount` signature | VAR-custom, no external standard — confirm arity internally | high (custom) |

_This document consolidates 5 research rounds on the yield/vault leg. Build-blocking decisions (Pattern B whitelist, stub vault, single-view hot path, ERC-8226-is-custom) are locked. Hashnote Entitlements address conflict, `resolveHuman` ABI, and Dynamic Python signing remain the open verify items._
