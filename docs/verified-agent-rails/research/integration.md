# Integration — Chain Topology for Verified Agent Rails

_Where the hot path runs: one chain, one VIEW call, zero new trust — and which chain is actually production-ready for a June 2026 build._

> **Feasibility verdict: YES — the full VAR composition is shippable in 36h, but ONLY as a single-chain monolith, and the only production-ready chain today (2026-06-13) is World Chain (chainId 480).** Arc mainnet does not launch until summer 2026 (Q3), ~3 weeks _after_ the hackathon. Arc testnet (5042002) is the only Arc surface available now, and hosting on it forces either an unproven World ID State Bridge deploy or off-chain AgentBook seeding — both add risk and at least one chips at the "zero new trust" invariant. **This research recommends re-locking from "Arc testnet host" (current `00_README.md` / `08_RISKS.md` decision) to "World Chain monolith for the demo, Arc as Phase-2 post-launch."** This unblocks every downstream Solidity decision.

---

## TL;DR for the build

- **Lock the chain: World Chain mainnet, chainId 480.** All four components (World ID verify, agent wallet, ERC-7943/8226 gated token, USDC settlement) are native and live there today. Zero bridges, zero relayers, zero off-chain attestation in the hot path.
- **The hot path is three same-chain VIEW calls** on one revert path: `token.canTransfer → resolver.isActiveForAmount → AgentBook lookup`. A VIEW call cannot cross chains, so co-location is not a preference — it is a hard requirement for the "ONE on-chain VIEW call" invariant.
- **Revocation is a same-chain state write.** Human flips a flag on AgentBook/resolver → the VIEW the hot path already reads returns `false` → next block (2s) the agent is locked out. The kill-shot works by construction on a monolith.
- **The conflict to resolve at hour 0:** current VAR docs lock Arc testnet. June 2026 reality contradicts that lock. Confirm the Circle/Arc bounty's testnet-eligibility (see Open Questions) — that single answer decides whether the Arc lock survives or World Chain is forced.

---

## Chain status matrix (verified 2026-06-13)

| Property | World Chain | Arc |
|----------|-------------|-----|
| **Network state** | Production mainnet (live Oct 2024) | **Testnet only** — mainnet "summer 2026" / Q3 (~3wk after demo) |
| **Chain ID** | `480` | `5042002` (testnet); `1243` (mainnet, ⚠️ verify) |
| **Native USDC** | ✅ `0x79A02482A880bCe3F13E09da970dC34dB4cD24D1` (live Jun 11–12, 2025) | Testnet USDC `0x3600000000000000000000000000000000000000` |
| **Gas token** | ETH | USDC (native, dual-decimal — see gotcha) |
| **USDC decimals** | 6 (ERC-20) | **6 as ERC-20, 18 as native gas precompile** — standardize on the 6-dec ERC-20 path |
| **CCTP** | V2 live | Testnet domain 7; mainstream liquidity is mainnet-focused |
| **World ID Router** | ✅ native (`0x17B354dD2595411ff79041f930e491A4Df39A278`, ⚠️ verify exact addr) | ❌ not native — needs a permissionless State Bridge deploy |
| **AgentBook** | ✅ canonical here (AgentKit / x402, launched Mar 17, 2026) | ❌ would require a hand-built mirror |
| **Block time** | 2s | sub-second (Malachite BFT ~780ms) |
| **RPC** | `https://worldchain-mainnet.g.alchemy.com/public` | `https://rpc.testnet.arc.network` |
| **Explorer** | `https://worldscan.org` | `https://testnet.arcscan.app` |
| **Architecture** | OP Stack L2, Optimism Superchain | L1, stablecoin-native |

**Confidence: high** on all World Chain rows; high on Arc testnet rows; the Arc mainnet chainId `1243` is ⚠️ **verify** (not confirmed against a live mainnet endpoint — it does not exist yet).

Sources: [Circle — Native USDC + CCTP V2 on World Chain](https://www.circle.com/blog/now-live-native-usdc-and-cctp-v2-on-world-chain), [Phemex — Arc mainnet summer 2026](https://phemex.com/news/article/circle-unveils-arc-blockchain-whitepaper-mainnet-launch-set-for-summer-2026-82817), [World ID on-chain docs](https://docs.world.org/world-id/id/on-chain), [chainid.network/5042002](https://chainid.network/chain/5042002/), [Arc connect docs](https://docs.arc.io/arc/references/connect-to-arc).

---

## The four viable topologies (and why one wins)

| # | Topology | Hot path | Cross-chain risk | 36h-viable? |
|---|----------|----------|------------------|-------------|
| **1** | **World Chain monolith** ⭐ | 3 same-chain VIEW calls | None | **YES — recommended** |
| 2 | Arc testnet + hand-built AgentBook mirror | 3 same-chain VIEW calls _if_ mirror is local | State Bridge deploy + seeding (~4–8h, unproven) | Conditional — only if Arc bounty accepts testnet |
| 3 | World Chain + Ethereum/Superchain bridge | VIEW + async bridge off hot path | Bridge for asset movement only | Overkill for demo |
| 4 | Hybrid (Arc token + cross-chain AgentBook query) | VIEW + oracle/Wormhole read | **Breaks "ONE VIEW call" + "zero new trust"** | **NO — do not build** |

**Why #1 wins:** every dependency is native on World Chain (World ID Router, AgentBook, native USDC, ERC-8004 registry). Nothing to mirror, nothing to bridge, nothing to seed cross-chain. The hot path is a pure synchronous sequence of three VIEW functions on one chain. Revocation is instant. This is the lowest-risk path for a 36h deadline.

**Why #2 is the fallback, not the default:** Arc testnet is stable (244.1M txs Oct 2025–May 2026) and keeps you in the Arc bounty track, but World ID Router is **not** native on Arc. You must permissionlessly deploy a World ID State Bridge to Arc testnet (allowed, but **no public example of any team having done it** — budget ~4–8h and run a spike in hour 0) and seed an AgentBook mirror. If that deploy is cut from scope, the Arc topology becomes **impossible** (no proof-of-human anchor).

**Why #4 is forbidden:** a cross-chain AgentBook read needs an oracle/Wormhole/LayerZero hop in the per-transfer path. That breaks both core invariants. Never put a cross-chain read in the hot path.

---

## The composition (concrete interfaces)

The per-transfer eligibility check, in execution order:

```
token transfer
  └─ ERC-7943  canTransfer(from, to, amount)        [Final, token-level pre-transfer hook]
       └─ ERC-8226  isActiveForAmount(agentId, principal, amount)  [Draft, mandate resolver]
            └─ AgentBook  resolveHuman(agentWallet)  [view, seeded once from World ID proof]
```

Three view functions, one revert path, zero new trust assumptions. All three resolve on **one** chain.

### ERC-7943 `canTransfer` — Final (frozen May 27, 2026)

```solidity
// Fungible-token gate. ~5–10k gas per VIEW call (vs 50k+ legacy modular systems).
function canTransfer(address from, address to, uint256 amount)
    external view returns (bool allowed);
```

Full fungible interface (from the EIP):

```solidity
interface IERC7943Fungible {
    function canSend(address account) external view returns (bool);
    function canReceive(address account) external view returns (bool);
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);
    function getFrozenTokens(address account) external view returns (uint256);
    function forcedTransfer(address from, address to, uint256 amount) external returns (bool);
    function setFrozenTokens(address account, uint256 amount) external returns (bool);
}
```

**Status: high confidence, production-ready.** Created Jun 10, 2025; Final May 27, 2026. Interface, errors, events, and behavior are frozen. Live implementations: CMTA/CMTAT, Chainlink Asset Compliance Engine, Brickken. Available on all EVM chains incl. World Chain. Source: [EIP-7943](https://eips.ethereum.org/EIPS/eip-7943).

### ERC-8226 `isActiveForAmount` — Draft (created Apr 12, 2026)

```solidity
// Mandate resolver. Returns true iff mandate active AND amount within tx/cumulative limits.
function isActiveForAmount(uint256 agentId, address principal, uint256 amount)
    external view returns (bool);
```

Companion functions referenced by the spec — **names appear stable, parameter lists are PROPOSED, ⚠️ verify against the latest draft before freezing Solidity:**

```solidity
// ⚠️ verify signatures — Draft, parameters may evolve pre-standardization
function grantMandate(...);     // params TBD — confirm in spec
function revokeMandate(...);    // params TBD — confirm in spec
function extendMandate(...);    // params TBD
function recordExecution(...);  // params TBD
function isActive(uint256 agentId) external view returns (bool);
function getActivePrincipal(uint256 agentId) external view returns (address);
```

**Status: the `isActiveForAmount` core resolver signature is locked and safe to code against; the grant/revoke/extend parameter lists are NOT yet frozen.** Note: it is unconfirmed whether `isActiveForAmount` carries an `asset`/token parameter for whitelist enforcement, or whether each resolver deployment is bound to a single token. VAR docs assume an asset dimension — ⚠️ verify against the spec. Source: [EIP-8226](https://eips.ethereum.org/EIPS/eip-8226).

> **Earlier-round note now corrected:** Round 1–2 research could not find ERC-8226 in public EIP catalogs and flagged it as possibly non-existent / internal terminology. Rounds 3–5 located it on `eips.ethereum.org` in **Draft** status with the signature above. **ERC-8226 is real and Draft.** The earlier "does not exist" finding is superseded.

### ERC-8004 — agent identity (Draft, but live on mainnet)

```solidity
function register(string agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId);
function getAgentWallet(uint256 agentId) external view returns (address);   // ⚠️ verify exact name
```

**Status: deployed to Ethereum mainnet Jan 29, 2026; 21k–45k+ agents registered by Feb 2026 (sources vary — treat as "tens of thousands").** Three registries: Identity (ERC-721 + URIStorage), Reputation, Validation. L2 registration <$1. This is the `agentId → principal` identity layer that ERC-8226's `agentId` references. VAR can deploy its own minimal Identity registry or integrate an existing deployment. Source: [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004), [KuCoin — ERC-8004](https://www.kucoin.com/blog/understanding-erc-8004-on-chain-identity-standard-for-ai-agents).

### World ID Router `verifyProof` (canonical, all chains)

```solidity
function verifyProof(
    uint256 root,
    uint256 groupId,                // 1 for Orb credentials
    uint256 signalHash,             // keccak256(signal) — bind to agent wallet address
    uint256 nullifierHash,          // track on-chain to prevent replay (VIEW does NOT prevent it)
    uint256 externalNullifierHash,
    uint256[8] calldata proof
) external view;
```

**Status: high confidence.** Native on World Chain. `groupId = 1` for Orb-only. The router is a VIEW — it validates the ZK proof but does **not** itself prevent replay; the caller must store `nullifierHash` on-chain (in AgentBook) so one human verifies once. Source: [World ID reference contracts](https://docs.world.org/world-id/reference/contracts).

### AgentBook lookup (interface inferred — address TBD)

```solidity
// ⚠️ verify — exact ABI / contract address NOT disclosed in primary World ID docs
interface IAgentBook {
    function resolveHuman(address agentWallet) external view returns (address human);
}
```

**Status: medium confidence.** AgentBook is the hub for World's AgentKit, **built on x402** (a World Chain micropayment relay), launched Mar 17, 2026. Registration is gasless via a hosted relay using CAIP-122 signed messages: `npx @worldcoin/agentkit-cli register <wallet-address>`. Critically, **AgentBook is a service, not a plain deployable contract you can `git clone` and redeploy** — "AgentBook lookup always resolves against the canonical World Chain deployment." For the demo, VAR likely deploys its **own** thin AgentBook/registry contract that stores `(agentWallet → human, nullifierHash, mandate)` seeded from a World ID proof, rather than depending on x402 internals. The exact canonical AgentBook address and `resolveHuman` signature are **TBD — confirm against the live ABI before writing seeding logic.** Sources: [AgentKit integrate docs](https://docs.world.org/agents/agent-kit/integrate), [agentbook.world](https://www.agentbook.world/).

---

## Settlement & key addresses

| Artifact | Value | Confidence |
|----------|-------|-----------|
| World Chain mainnet RPC | `https://worldchain-mainnet.g.alchemy.com/public` | high |
| World Chain RPC (WS) | `wss://worldchain-mainnet.g.alchemy.com/public` | high |
| World Chain RPC (alt) | `https://480.rpc.thirdweb.com` | high |
| World Chain explorer | `https://worldscan.org` | high |
| World Chain Chain ID | `480` | high |
| World Chain block time | 2s | high |
| **World Chain native USDC** | `0x79A02482A880bCe3F13E09da970dC34dB4cD24D1` | high |
| World ID Verifier proxy | `0x00000000009E00F9FE82CfeeBB4556686da094d7` | high |
| World ID Address Book | `0x57b930D551e677CC36e2fA036Ae2fe8FdaE0330D` | high |
| World ID Router (World Chain) | `0x17B354dD2595411ff79041f930e491A4Df39A278` | ⚠️ verify |
| Arc testnet RPC | `https://rpc.testnet.arc.network` | high |
| Arc testnet Chain ID | `5042002` | high |
| Arc testnet USDC | `0x3600000000000000000000000000000000000000` | high |
| Arc testnet explorer | `https://testnet.arcscan.app` | high |
| Arc testnet faucet | `https://faucet.circle.com` | high |
| Canonical AgentBook address | **TBD** | — |
| ERC-8004 registry on World Chain | **TBD** (deploy own minimal registry) | — |
| Yield instrument on World Chain | **TBD** (no USDC-yield protocol confirmed live; use mock vault) | — |

> Multiple World ID Router / Verifier addresses appear across rounds (`0x0000...094d7` verifier proxy, `0x57b9...330D` Address Book, `0x17B3...A278` router). These are **distinct contracts**, not duplicates: verify which one exposes `verifyProof` on World Chain before wiring the call. ⚠️ verify.

**USDC dominance context (build-relevant):** 98.6% of AI-agent crypto payments settled in USDC (May 2025–Apr 2026), $73M+ volume across 176M txs. USDC is the correct settlement asset by a wide margin. Source: [Coincu report](https://coincu.com/report-986-ai-agent-crypto-transactions-settled-in-usdc/).

---

## Agent wallet (Dynamic) — integration surface & gotchas

- **Production-ready, multi-chain** (EVM, SVM, Bitcoin, Cosmos, 800+ connectors). World Chain is OP Stack EVM, so it falls under generic Tier-1 EVM embedded-wallet support — **not explicitly enumerated in the tier table**, so ⚠️ verify World Chain support directly before locking. Confidence: medium.
- **Arc support is real but testnet-bound:** confirmed via ETHGlobal NY June 2026 bounties ($1–2K USDC for Dynamic + Unlink nanopayments on Arc testnet). No explicit confirmation of full agent-wallet SDK support for Arc **mainnet** post-launch.
- **Embedded Wallets (TSS-MPC) are public** with sub-second signing — but TSS-MPC specifically may still gate behind **closed-alpha access**. Standard embedded wallets are GA. ⚠️ Confirm closed-alpha access path (whitelist/API key) before backend work if MPC is required.
- **Python gotcha:** the agent-wallet SDK is **Node-only** (`@dynamic-labs-wallet/node-evm`); no documented Python SDK. VAR's FastAPI backend must **sidecar the Node SDK or wrap it over HTTP**. Budget for this in the backend lane.
- **Under-documented:** the delegation webhook payload shape and `ServerKeyShare` structure are incomplete in public docs — medium risk for the FastAPI integration.

Sources: [Dynamic ETHGlobal NY 2026](https://www.dynamic.xyz/docs/overview/ethglobal-new-york-2026), [Dynamic wallets/chains](https://www.dynamic.xyz/docs/overview/wallets-and-chains/overview), [QuickNode — Dynamic](https://www.quicknode.com/builders-guide/tools/dynamic-by-dynamic-labs).

---

## What this unblocks for the build

- **Chain lock → all Solidity work.** Pick World Chain mainnet (480). Gated token + ERC-8226 resolver + AgentBook + nullifier registry all deploy here. Settlement in native USDC (`0x79A0...24D1`). No bridge in the demo path.
- **Gated token (ERC-7943):** implement `canTransfer(from,to,amount)` calling the resolver; ~5–10k gas; build against the **Final** interface with zero interface risk.
- **Mandate / AgentBook:** deploy a lightweight custom registry storing `(agentWallet, human, spendCap, assetWhitelist, expiry, revoked)` keyed by `agentId`, anchored to a World ID `nullifierHash`. Optionally back it with an ERC-8004 Identity registry for the `agentId → wallet` mapping.
- **World ID binding:** `signal = agent wallet address`; verify on-chain via the World ID Router on World Chain (same chain); store `nullifierHash` to enforce one-verify-per-human and prevent replay.
- **Revocation kill-shot:** `revoke` flips on-chain state the hot-path VIEW already reads → next block (2s) `canTransfer` returns `false`. Emit a `MandateRevoked(agentId)` event so the frontend can watch and react live. Confirm whether revocation lives in ERC-8226 (`revokeMandate`) or a custom AgentBook op — ⚠️ verify the 8226 signature.
- **Pre-flight optimization:** the agent loop can call `canTransfer` as a VIEW _before_ signing to skip gas on known-bad transfers (it's a pure view — free to probe).
- **ERC-1404-style revert codes:** machine-readable restriction codes (small range, ~0–6 per VAR docs) are low-risk to layer onto the 7943/8226 revert path. ERC-7943 does **not** mandate a code registry — VAR adds the `detectTransferRestriction`/`messageForTransferRestriction` convention itself. ⚠️ verify whether 7943 defines any standard codes.
- **Phase 2 (post-hackathon):** when Arc mainnet ships (Q3 2026), redeploy the same contracts to Arc, bridge USDC via CCTP V2, and either deploy a World ID State Bridge to Arc or anchor an AgentBook mirror canonically from World Chain.

---

## Demo flow (single-chain, World Chain)

1. Human scans World ID Orb → ZK proof (nullifier + signal = agent wallet).
2. Frontend calls `verifyProof` on World Chain → capture `nullifierHash`.
3. AgentBook records `(agentWallet, human, spendCap, assetWhitelist, expiry)`; nullifier stored.
4. Dynamic provisions the agent wallet, signs the Mandate (Agent Passport).
5. Gated token transfer succeeds — `canTransfer → isActiveForAmount → AgentBook` all pass.
6. Agent autonomously pays for a service API in USDC; parks idle USDC in a (mock) yield vault.
7. Human taps **revoke** on their phone → `revoked = true` on-chain.
8. **Next block (2s): `canTransfer` returns `false`. Agent locked out. "Accountability with one click."**

---

## Residual open questions (hour-0 checklist)

| # | Question | Severity | Why it matters |
|---|----------|----------|----------------|
| 1 | Does the Circle/Arc ETHGlobal bounty require Arc **mainnet** settlement, or is Arc **testnet** eligible? | **BLOCKING** | Mainnet-required ⇒ Arc lock is impossible (Q3 launch) ⇒ World Chain forced. Testnet-OK ⇒ Arc lock survivable. |
| 2 | Exact canonical AgentBook address + `resolveHuman` ABI on World Chain? | HIGH | TBD in docs; needed before seeding logic. Likely deploy own thin registry. |
| 3 | Has anyone deployed World ID State Bridge to Arc testnet? | HIGH | Only relevant if topology #2 chosen; unproven, budget 4–8h spike. |
| 4 | Which World Chain contract (`...094d7` / `...330D` / `...A278`) exposes `verifyProof`? | HIGH | Three distinct addresses across rounds; wire the right one. |
| 5 | Dynamic: World Chain support confirmed? TSS-MPC closed-alpha access granted? | MEDIUM | Wallet provisioning + signing gate. Standard embedded wallets are the fallback. |
| 6 | ERC-8226 `grantMandate`/`revokeMandate` exact parameter signatures? | MEDIUM | Names stable, params PROPOSED. Freeze against a specific draft commit. |
| 7 | Does `isActiveForAmount` carry an `asset` parameter, or is the resolver single-token? | MEDIUM | Affects whitelist enforcement design. |
| 8 | Is the Worldcoin $15K bounty chain-agnostic (works wherever World ID verifies)? | MEDIUM | If agnostic, World Chain topology forfeits nothing. |
| 9 | ERC-7943 `canTransfer` wired at `_beforeTokenTransfer`, or called manually in `transfer`/`transferFrom`? | LOW | Avoid reentrancy gaps; confirm integration pattern against spec. |
| 10 | USDC-denominated yield protocol live on World Chain in June 2026? | LOW | If none, use a mock vault for the "park idle funds" beat. |

---

## Superseded / corrected findings (audit trail)

- **ERC-8226 "does not exist"** (R1–R2) → **corrected (R3–R5): it is real, Draft status, signature `isActiveForAmount(uint256,address,uint256)` locked.**
- **"Agent Passport is on-chain"** (implied by canonical terms) → **corrected: Agent Passport (the public project) is a hybrid FastAPI backend + ERC-5192 soulbound badge on Base L2, NOT a pure on-chain contract.** VAR's "Agent Passport" is its own on-chain mandate attestation, distinct from that project — implement it as part of the AgentBook/resolver, not by depending on the external Passport service.
- **Recommended host: Arc testnet** (current `00_README.md` / `08_RISKS.md`) → **this research recommends re-locking to World Chain monolith** for the demo, pending bounty clarification (Q1).

---

## Sources

- World ID on-chain: https://docs.world.org/world-id/id/on-chain
- World ID reference contracts: https://docs.world.org/world-id/reference/contracts
- World ID Address Book: https://worldscan.org/address/0x57b930D551e677CC36e2fA036Ae2fe8FdaE0330D
- World ID State Bridge: https://github.com/worldcoin/world-id-state-bridge · https://world.org/blog/announcements/new-state-bridge-update-enables-permissionless-integration-world-id
- World AgentKit / AgentBook: https://docs.world.org/agents/agent-kit/integrate · https://www.agentbook.world/
- Circle — native USDC + CCTP V2 on World Chain: https://www.circle.com/blog/now-live-native-usdc-and-cctp-v2-on-world-chain
- Circle — Arc whitepaper / mainnet timeline: https://phemex.com/news/article/circle-unveils-arc-blockchain-whitepaper-mainnet-launch-set-for-summer-2026-82817 · https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance
- Arc connect / testnet: https://docs.arc.io/arc/references/connect-to-arc · https://chainid.network/chain/5042002/ · https://docs.arc.network/arc/tutorials/bridge-usdc-to-arc
- ERC-7943: https://eips.ethereum.org/EIPS/eip-7943 · https://www.globenewswire.com/news-release/2026/05/27/3301737/0/en/erc-7943-achieves-final-status-as-ethereums-standard-for-real-world-asset-tokenization.html
- ERC-8226: https://eips.ethereum.org/EIPS/eip-8226
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004 · https://www.kucoin.com/blog/understanding-erc-8004-on-chain-identity-standard-for-ai-agents
- ERC-1404: https://github.com/simple-restricted-token/simple-restricted-token · https://erc1404.org/
- Dynamic: https://www.dynamic.xyz/docs/overview/ethglobal-new-york-2026 · https://www.dynamic.xyz/docs/overview/wallets-and-chains/overview · https://www.quicknode.com/builders-guide/tools/dynamic-by-dynamic-labs
- Across — World Chain bridge: https://across.to/blog/Across-Integrates-with-World-Chain · https://across.to/worldchain-bridge
- AI-agent USDC settlement share: https://coincu.com/report-986-ai-agent-crypto-transactions-settled-in-usdc/
- World Chain RPC: https://www.alchemy.com/rpc/worldchain · https://quicknode.com/docs/worldchain
