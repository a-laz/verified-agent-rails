# Arc (Circle) — Verified Agent Rails Settlement Layer

*The compliant USDC L1 where VAR's gated token settles, the agent pays, and the one-click revoke lands next block.*

**Feasibility verdict: YES (build on testnet now).** Arc testnet is fully operational for a 36h hackathon: live RPC (chain ID `5042002`), native USDC at `0x3600…0000` (6-decimal ERC-20 interface), faucet active, ~244M txns processed by May 2026, full EVM compatibility. VAR's gated-token stack (ERC-7943 `canTransfer` → ERC-8226 `isActiveForAmount` → AgentBook) deploys as **standard Solidity — no Arc precompile required** for the hot path. Residual risks are engineering, not feasibility: a decimal-mismatch footgun in `spendCap`, Dynamic TSS-MPC closed-alpha access, and the AgentBook mirror being VAR-built (no public reference impl). Mainnet is summer 2026 — build testnet, plan migration.

---

## 1. Quick-reference card

| Item | Value | Confidence |
|------|-------|-----------|
| Chain type | EVM-compatible sovereign **L1** (Malachite BFT consensus, Reth execution) | high |
| Testnet chain ID | `5042002` (`0x4cef52`) | high |
| Mainnet chain ID | `1243` ⚠️ verify (one source; an earlier round read `5042` from chainspec) | medium |
| Devnet chain ID | `5042001` | high |
| Testnet HTTP RPC | `https://rpc.testnet.arc.network` | high |
| Testnet WS RPC | `wss://rpc.testnet.arc.network` | high |
| Block explorer | `https://testnet.arcscan.io` | high |
| Faucet | `https://faucet.circle.com` — 20 USDC / address / 2h | high |
| Native gas token | **USDC** (dollar-denominated gas, ~$0.01/tx) | high |
| Finality | Deterministic sub-second (~200–400ms blocks observed) | high |
| Testnet maturity | "Alpha, under audit"; ~244.1M txns by May 2026; targets 99.99% uptime (not yet met) | high |
| Mainnet | Expected **summer 2026**, no fixed date | high |

**Backup RPCs (pre-stage for demo):** dRPC (`https://drpc.org/chainlist/arc-testnet-rpc`, no-limit tier), Alchemy (`https://www.alchemy.com/rpc/arc-testnet`), QuickNode (`https://www.quicknode.com/docs/arc`), Blockdaemon (~200 req/s). Official endpoint rate limits are **undocumented** — do not rely on a single RPC for demo day.

---

## 2. Contract addresses (Arc testnet)

| Name | Address | Confidence | Source |
|------|---------|-----------|--------|
| USDC (native, ERC-20 interface) | `0x3600000000000000000000000000000000000000` | high | Arc docs / RPC-verified |
| CCTP TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | high | Arc docs |
| CCTP MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` | high | Arc docs |
| Circle Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | high | Arc docs |
| Circle Gateway Minter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` | high | Arc docs |
| World ID **AgentBook** (on **Base**, not Arc) | `0x57b930D551e677CC36e2fA036Ae2fe8FdaE0330D` | high | worldscan.org |
| ERC-8004 Identity Registry (Ethereum mainnet) | `0x8004A169…` (vanity) | medium | EIP-8004 / press |
| ERC-8004 Identity Registry (testnets) | `0x8004A818…` (vanity) | medium | EIP-8004 |

### Native precompiles (⚠️ verify — conflicting evidence across rounds)
Rounds 1–2 read these from `circlefin/arc-node` source; Round 4 could **not** find them enumerated in published docs.

| Name | Address | Confidence |
|------|---------|-----------|
| Native Coin Authority (mint/burn/transfer) | `0x1800000000000000000000000000000000000000` | low ⚠️ verify |
| Native Coin Control (blocklist/isBlocklisted) | `0x1800000000000000000000000000000000000001` | low ⚠️ verify |

**Build implication: VAR does NOT need these precompiles.** The dual-decimal sync uses a precompile internally, but VAR's gating is pure EVM Solidity. Treat the `0x1800…` addresses as informational only; do not put them in the hot path.

---

## 3. USDC dual-decimal architecture — the #1 footgun

**Confirmed (high):** Arc USDC is a single asset exposed two ways:

- **Native balance** (gas, low-level): **18 decimals**
- **ERC-20 interface** at `0x3600…0000` (`transfer`/`approve`/`balanceOf`): **6 decimals** — verified via `decimals()` RPC call
- A precompile keeps both in perfect parity automatically: **`1e18` native = `1e6` ERC-20** (12-decimal gap)

> **RULE for VAR: always use the 6-decimal ERC-20 interface for ALL user-facing / mandate logic.** `spendCap`, balance reads, and transfer amounts must all be 6-decimal.

### Decimal-mismatch security risk (high — applies directly to VAR `spendCap`)

```text
If mandate.spendCap is stored assuming 18 decimals (e.g. 1e18 = "1 USDC")
but compared against USDC.balanceOf(agent) which returns 6-decimal units (1e6 = 1 USDC),
the cap is silently off by 1e12.

  intent:   spendCap = 1 USDC
  18-dec:   1e18
  6-dec:    1e6
  → comparison reverts unpredictably OR an attacker crafts a 6-dec cap to bypass 18-dec logic.
```

This is a **silent** bypass (no obvious error) and breaks VAR's core "accountable agent" invariant. A real precedent: the Tigris protocol bug where an 18-decimal assumption silently broke 6-decimal USDT integration (Zokyo audit tutorial). **Action: audit VAR contracts for any hardcoded `1e18` / `* 10**18` that leaks into `spendCap` or balance checks before demo.**

---

## 4. The VAR gated-transfer stack on Arc

Hot path = **one on-chain VIEW call**, no paymaster/relayer/off-chain attestation. All Arc-local, all standard EVM.

```
USDC-denominated gated token .transfer()
   └─ ERC-7943  canTransfer(from, to, amount)        [FINAL, signature locked]
        └─ ERC-8226 isActiveForAmount(agentId, principal, amount)  [DRAFT]
             └─ checks mandate.revoked → expiry → cap → AgentBook eligibility (Arc-local mirror)
   ineligible ⇒ REVERT with machine-readable reason (ERC-1404-style — VAR-built layer)
```

### ERC-7943 `canTransfer` — FINAL (May 27, 2026), production-safe

```solidity
// Fungible (ERC-20) shape — the one VAR uses:
function canTransfer(address from, address to, uint256 amount)
    external view returns (bool allowed);

// Custom errors defined by the standard:
//   ERC7943CannotSend, ERC7943CannotReceive,
//   ERC7943CannotTransfer, ERC7943InsufficientUnfrozenBalance
```
Source: https://eips.ethereum.org/EIPS/eip-7943 . Status frozen → safe to adopt. NFT/1155 variants exist; VAR uses ERC-20 only.

### ERC-8226 `isActiveForAmount` — DRAFT "Regulated Agent Mandate"

> ⚠️ **Status caveat:** Rounds 2 & 4 could not find ERC-8226 in the public EIP repo and flagged it as possibly VAR-internal. Round 5 reports it **exists as a Draft** at `eips.ethereum.org/EIPS/eip-8226`. **Verify the canonical EIP URL before citing externally.** Either way, the interface below is what VAR builds against.

```solidity
// Mandate struct (per Round 5 reading of the Draft):
struct Mandate {
    address principal;          // the accountable human's address
    bytes32 identityRef;        // World ID / ERC-8004 ref
    bytes32 scopeHash;          // asset whitelist + policy hash
    address complianceProvider;
    bytes   onChainScope;
    uint256 validFrom;
    uint256 validUntil;
    uint256 cumulativeUsed;
    bool    revoked;            // ← the kill-switch
}

function grantMandate(...)   external;
function revokeMandate(uint256 agentId) external;   // flips revoked = true
function extendMandate(...)  external;
function recordExecution(...) external;             // state WRITE — see open Q on cumulative cap
function isActiveForAmount(uint256 agentId, address principal, uint256 amount)
    external view returns (bool);                   // checks revoked FIRST, then expiry/cap
function isActive(uint256 agentId) external view returns (bool);
```

**Open design gap:** the spec signature has no `asset` parameter, but VAR needs an asset-whitelist check. Either (a) extend the signature with `address asset`, or (b) bind one resolver per token contract. Confirm against the Draft before locking the ABI.

### AgentBook — registry seeded by World ID proof

- **Canonical AgentBook lives on Base / World Chain, NOT Arc.** Registration is gasless (hosted relay on Base); canonical lookup resolves on World Chain.
- **VAR strategy (Round 5, high confidence):** deploy an **Arc-local AgentBook mirror**, seeded **once** at grant time via World ID `verifyProof` (track `nullifierHash` to block replay), then **frozen**. All hot-path lookups read the Arc-local copy → zero cross-chain latency, decoupled from World Chain availability.
- **No public reference implementation** — VAR must build the mirror contract. Interface (proposed): `resolveHuman(address agent) → address human`. TBD.

---

## 5. The revocation kill-shot — technically sound

The demo climax ("human revokes from phone → next block agent locked out") is **Arc-LOCAL and instant**:

1. `revokeMandate(agentId)` writes `mandate.revoked = true` on the Arc ERC-8226 resolver (one Arc tx).
2. Next `transfer` → `canTransfer` → `isActiveForAmount` reads `revoked` from Arc-local storage → returns `false` → **REVERT**.
3. With Arc's sub-second finality, "next block locked out" is a **local guarantee** — no cross-chain sync, no World Chain freshness dependency.

This is the strongest verified result for VAR: the leash is the `mandate.revoked` write, **not** AgentBook freshness, so the demo is decoupled from World Chain availability.

---

## 6. Payments — nanopayments, CCTP, gas

### Circle Nanopayments (live on Arc testnet) — for the "agent pays for a service" beat
- Gas-free USDC transfers down to **$0.000001**, via **EIP-3009 `TransferWithAuthorization`** signed off-chain + **batch settlement** through Circle Gateway.
- **Application-layer pattern, NOT a precompile.** Agent signs locally → server verifies → Gateway batches thousands → one on-chain settlement. **No relayer in the agent's trust path** → fits VAR's "zero new trust" invariant.
- Driven by **x402** (HTTP 402 Payment Required): agent requests resource → gets payment instructions → signs EIP-3009 → retries → served.
- Arc = Gateway Domain ID **26**, ~1-block confirmation, ~0.5s to attestation.
- SDK: `@circle-fin/x402-batching`; sample repo `github.com/BlockRunAI/circle-nanopayment-sample`.

```text
EIP-3009 nanopayment flow:
Agent signs TransferWithAuthorization (off-chain)
  → Server verifies signature + balance
  → Gateway batches authorization
  → Single on-chain settlement per batch (gas-free from agent's view)
```

### CCTP V2 (bridge USDC into Arc)
- Burn on source → Circle attestation → mint on Arc. Fast Transfer ~8–20s, Standard ~15–19m. No bridge-custody risk.
- ⚠️ **Mixed signal:** Arc CCTP contracts are listed in Arc docs (addresses in §2), but Round 5 notes Circle's master CCTP chain list doesn't explicitly enumerate Arc testnet. **For the demo, prefer the faucet** (20 USDC/2h) to source USDC; treat CCTP-to-Arc as verify-before-relying.

### Gas
- Paid in USDC, ~$0.01/tx, predictable. No wrapped-ether needed. Set VAR spend caps in **6-decimal USDC units**.

---

## 7. What this unblocks for the build

- **Deploy now on Arc testnet** — Hardhat/Foundry/ethers.js all work. RPC `https://rpc.testnet.arc.network`, chainId `5042002`, fund via faucet.
- **Gated token = standard Solidity.** ERC-7943 `canTransfer` hook reading ERC-8226 + Arc-local AgentBook mirror. No precompile dependency.
- **Mandate `spendCap` in 6-decimal USDC** — match `balanceOf`/`transfer`. Audit for `1e18` leaks.
- **Revocation is Arc-local & instant** — the demo kill-shot needs no cross-chain plumbing.
- **Nanopayments for the service-payment beat** — EIP-3009 + Gateway, no relayer in trust path.
- **Dynamic** provisions the agent wallet (sub-second TSS-MPC signing claimed) — standard EVM integration on Arc. ⚠️ closed alpha; **request access hour 0**; fallback = standard Dynamic embedded wallet (compliance gate lives in token+mandate, not the signer).
- **ERC-8004** can anchor World-ID-backed agent identity as metadata (orthogonal to gating) — optional augmented trust layer; live on mainnet (45K+ agents, deployed Jan 29, 2026).
- **Anthropic Claude Code** is a confirmed live Arc builder-ecosystem participant — usable for agent scaffolding.

---

## 8. Residual open questions / blockers

| # | Question / blocker | Severity | Status |
|---|--------------------|----------|--------|
| 1 | ERC-8226 canonical status: Draft (Round 5) vs not-found (Rounds 2/4). Verify the EIP URL. | High | ⚠️ verify |
| 2 | `mandate.spendCap` decimal encoding — must be 6-dec. Audit VAR contracts for `1e18` leaks. | **Critical** | Open (code audit) |
| 3 | `isActiveForAmount` has no `asset` param; VAR needs asset-whitelist. Extend sig or bind 1 token/resolver? | High | Open (design) |
| 4 | AgentBook Arc-mirror contract — no public reference impl; VAR must build `resolveHuman(agent)→human`. | High | TBD |
| 5 | `nullifierHash` replay tracking at seed time — on-chain (gas) vs off-chain (replay risk)? | Med | Open |
| 6 | `recordExecution` is a state WRITE — in-band with transfer (same tx) or post-hoc? Race on cumulative cap. | Med | Open |
| 7 | ERC-1404-style machine-readable revert codes — ERC-7943 defines errors but no code+message layer. VAR builds `detectTransferRestriction`/`messageForTransferRestriction`. Confirm revert bubbles to agent loop. | Med | Open (VAR-built) |
| 8 | Dynamic TSS-MPC closed-alpha access; no Python SDK (need Node sidecar from FastAPI). | High | Confirm hour 0 |
| 9 | CCTP-to-Arc-testnet availability ambiguous. Use faucet for demo. | Med | ⚠️ verify |
| 10 | Mainnet chain ID `1243` vs `5042` conflict; mainnet not live (summer 2026). | Low | ⚠️ verify |
| 11 | Arc testnet stability / RPC rate limits undocumented, "early days." Pre-stage backup RPC + pre-record demo run. | Med | Mitigation ready |
| 12 | `setOperator` delegated revocation — does VAR need it, or principal-only `revokeMandate`? | Low | Open |
| 13 | Yield sweep (idle funds → permitted instrument): no confirmed Arc testnet yield protocol; ERC-4626 mock stub straightforward. P2/cuttable. | Low | TBD |
| 14 | Arc Privacy precompile (opt-in confidential execution) — not needed for hot path (public view call). Stretch goal. | Low | Out of scope |

---

## 9. Sources

**Arc core**
- https://www.circle.com/pressroom/circle-launches-arc-public-testnet
- https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance
- https://docs.arc.io/arc/references/contract-addresses
- https://docs.arc.io/arc/tools/node-providers
- https://docs.arc.io/arc/references/evm-compatibility
- https://www.arc.io/blog/building-with-usdc-on-arc-one-token-two-interfaces
- https://www.arc.io/blog/technical-insights-on-arc-testnet-reliability
- https://chainid.network/chain/5042002/
- https://raw.githubusercontent.com/circlefin/arc-node/main/README.md
- https://raw.githubusercontent.com/circlefin/arc-node/main/docs/running-an-arc-node.md
- https://raw.githubusercontent.com/circlefin/arc-node/main/crates/shared/src/chain_ids.rs
- https://raw.githubusercontent.com/circlefin/arc-node/main/crates/precompiles/src/helpers.rs
- https://raw.githubusercontent.com/circlefin/arc-node/main/crates/precompiles/src/native_coin_control.rs
- https://raw.githubusercontent.com/circlefin/arc-node/main/crates/precompiles/src/native_coin_authority.rs
- https://phemex.com/news/article/circle-unveils-arc-blockchain-whitepaper-mainnet-launch-set-for-summer-2026
- https://www.bitget.com/asia/news/detail/12560605407146

**Payments (nanopayments / CCTP / Gateway)**
- https://www.circle.com/blog/circle-nanopayments-launches-on-testnet-as-the-core-primitive-for-agentic-economic-activity
- https://www.circle.com/blog/powering-the-agentic-economy-with-circle-nanopayments
- https://www.circle.com/blog/build-agentic-systems-for-high-frequency-sub-cent-transactions
- https://developers.circle.com/cctp
- https://developers.circle.com/gateway/nanopayments
- https://developers.circle.com/gateway/references/supported-blockchains
- https://github.com/BlockRunAI/circle-nanopayment-sample
- https://faucet.circle.com/

**Standards (ERC-7943 / 8226 / 8004)**
- https://eips.ethereum.org/EIPS/eip-7943
- https://eips.ethereum.org/EIPS/eip-8226 (⚠️ verify canonical status)
- https://eips.ethereum.org/EIPS/eip-8004
- https://www.globenewswire.com/news-release/2026/05/27/3301737/0/en/erc-7943-achieves-final-status-as-ethereums-standard-for-real-world-asset-tokenization.html
- https://news.bitcoin.com/what-is-erc-8004-ethereums-new-agent-standard-powers-thousands-of-onchain-ai-identities/

**Identity / wallets**
- https://docs.world.org/agents/agent-kit/integrate
- https://docs.world.org/world-id/reference/address-book
- https://github.com/worldcoin/agentkit
- https://www.dynamic.xyz/blog/introducing-dynamic-embedded-wallets-with-tss-mpc
- https://www.dynamic.xyz/features/wallet-infrastructure
- https://www.coindesk.com/tech/2026/03/17/sam-altman-s-world-teams-up-with-coinbase-to-prove-there-is-a-real-person-behind-every-ai-transaction

**Security**
- https://zokyo-auditing-tutorials.gitbook.io/zokyo-tutorials/tutorial-19-18-decimal-assumption/examples-of-vulnerabilities-to-do-with-assuming-18-decimals

**RPC providers (backup)**
- https://drpc.org/chainlist/arc-testnet-rpc
- https://www.alchemy.com/rpc/arc-testnet
- https://www.quicknode.com/docs/arc
