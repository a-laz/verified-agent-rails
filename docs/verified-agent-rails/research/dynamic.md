# Dynamic (Fireblocks) — Agent-Wallet Rails for VAR

*Provisioning, scoping, and headless signing of an autonomous agent wallet on Circle's Arc, with a World-ID-anchored human accountable for every transfer.*

> **Feasibility verdict: PARTIAL — GREENLIT for the hackathon on Arc *testnet*.** Dynamic (acquired by Fireblocks Oct 2025) provides production-GA TSS-MPC agent wallets, headless delegated signing, custom-EVM (Arc) support, and a Policy Engine that maps 1:1 onto VAR's "Mandate." Two seams are real engineering work, not blockers: (1) the agent-signing SDK is **Node-only** → FastAPI must call a thin Node sidecar; (2) **Arc mainnet is not live** (summer 2026 TBD, no public RPC/addresses) → demo on testnet (chainId 5042002). The VAR hot-path invariant (one on-chain VIEW call) is *unaffected* — all signing/delegation is off-path.

---

## 1. What Dynamic/Fireblocks gives VAR (the role in the flow)

| VAR flow step | Dynamic/Fireblocks primitive | Status |
|---|---|---|
| (2) Human provisions an **agent wallet** | TSS-MPC Agentic Wallet (2-of-2 threshold), developer-managed, not user-custodied | GA (May 20 2026) |
| (2) Human signs the **Mandate** (spend cap, asset whitelist, expiry, revocable) | **Fireblocks Policy Engine** — per-wallet/per-delegation rules, sits OUTSIDE agent execution path | GA |
| (4) Agent **autonomously signs** the USDC transfer on Arc | `delegatedSignTransaction()` → `Promise<0x${string}>`, headless Node SDK | GA, Node-only |
| (4) Agent pays a 402-gated service | x402 integration (Fireblocks joined x402 Foundation May 2026); EIP-3009 `transferWithAuthorization` | GA on Base/Solana; Arc support ⚠️ verify |
| Arc as target chain | Custom EVM via `evmNetworks` config (chainId 5042002 + RPC) | GA (testnet) |
| Demo climax: human **revokes** → next block locked out | Policy Engine revoke (off-chain) **+** VAR's own AgentBook on-chain revoke | See §6 |

**Key corporate fact:** Fireblocks acquired Dynamic Oct 23 2025 (~$90M). Both brands maintained with separate docs: `docs.dynamic.xyz` (Dynamic SDK) and `ncw-developers.fireblocks.com` / `developers.fireblocks.com` (Fireblocks NCW embedded wallet). 50M+ cumulative wallets deployed. Agentic capabilities shipped in the **Fireblocks Agentic Payments Suite, GA May 20 2026** — *not* closed-alpha. *(high)*

---

## 2. Concrete artifacts (build against these)

### 2.1 Headless agent signing — Dynamic Node SDK

```ts
// npm: @dynamic-labs-wallet/node-evm  (also node-svm for Solana)
// Returns hex-encoded signed tx, ready for eth_sendRawTransaction.
delegatedSignTransaction(
  delegatedClient: DelegatedEvmWalletClient,
  opts: {
    walletId: string;
    walletApiKey: string;
    keyShare: object;                 // server/external key share
    transaction: TransactionSerializable;   // Viem type
  }
): Promise<`0x${string}`>;

delegatedSignMessage(
  delegatedClient: DelegatedEvmWalletClient,
  opts: { walletId: string; walletApiKey: string; keyShare: object; message: string }
): Promise<string>;

// Key-share management (recovery / external server shares)
evmClient.getExternalServerKeyShares({ accountAddress: '0x...' }): Promise<KeyShare[]>;
// SVM equivalent: getSvmWallets() → { externalServerKeyShares: ServerKeyShare[] }
//   plus exportExternalServerKeyShares, getWalletExternalServerKeyShareBackupInfo
```
*Source: dynamic.xyz/docs/node-sdk/reference/evm/delegated-sign-transaction (high)*

### 2.2 Alternative path — Fireblocks NCW SDK (`@fireblocks/ncw-js-sdk`)

```ts
const txId = await ew.createTransaction({
  source:      { type: PeerType.END_USER_WALLET, walletId: '<agent_wallet_id>', id: '0' },
  destination: { type: PeerType.ONE_TIME_ADDRESS, oneTimeAddress: { address: '<recipient>' } },
  assetId: 'USDC',
  amount:  '<amount>',
});
await ewCore.signTransaction(txId);   // Promise<void/string>; async multi-round MPC
```
- **2-of-2 MPC:** one key share on device, one on Fireblocks SGX server.
- **Two required API users:** `NCW Admin` (wallet lifecycle / enable-disable) + `NCW Signer` (create/sign tx). Each gets its own API key + private-key PEM in the backend.
- **Backend proxy pattern:** client SDK → customer backend → Fireblocks API RPC. Reference: `github.com/fireblocks/ncw-backend-demo` (Express).
*Source: ncw-developers.fireblocks.com (high)*

### 2.3 Arc custom-chain config for Dynamic frontend

```ts
const evmNetworks = [{
  chainId: 5042002,
  networkId: 'arc-testnet',
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },  // native gas = 18-dec
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
}];
// Pass to <DynamicContextProvider settings={{ overrides: { evmNetworks } }} />
// or use mergeNetworks(). An array fully OVERRIDES dashboard networks.
```
*Source: dynamic.xyz/docs/chains/evmNetwork (high)*

### 2.4 Arc testnet network facts

| Field | Value | Confidence |
|---|---|---|
| chainId | `5042002` | high |
| Official RPC | `https://rpc.testnet.arc.network` | high |
| Alt RPC (DRPC) | `https://arc-testnet.drpc.org` | high |
| Alt RPC (Alchemy) | `https://arc-testnet.g.alchemy.com/v2/<key>` (+ WSS) | high |
| Alt RPC (Thirdweb) | `https://5042002.rpc.thirdweb.com` | high |
| Alt RPC (QuickNode) | Arc testnet supported, HTTP/WSS | high |
| Block explorer | `https://testnet.arcscan.app` | high |
| Native gas | USDC (fees paid in USDC) | high |
| **USDC contract** | `0x3600000000000000000000000000000000000000` | high |
| Launched / scale | Oct 28 2025 · 244.1M txns by May 5 2026 | high |
| **Mainnet** | **NOT live** — "summer 2026" TBD; RPC + addresses unpublished | high |

**Arc USDC dual interface (critical gotcha):** native balance is **18 decimals** (gas/transfers), ERC-20 interface (`0x3600…0000`) exposes **6 decimals**. Conversion `1e18 native = 1e6 ERC-20`; a precompile syncs both — same underlying token. Pick the right decimal scale per call. *(high)*

### 2.5 x402 / EIP-3009 payment leg

```solidity
// USDC EIP-3009 (gasless for the agent; relayer/merchant pays gas)
function transferWithAuthorization(
  address from, address to, uint256 value,
  uint256 validAfter, uint256 validBefore,
  bytes32 nonce, bytes sig
) returns (bool);
```
Flow: agent hits HTTP **402** → reads payment instruction → produces an **EIP-712 signature** over the `transferWithAuthorization` params (via the Node sidecar signing path) → attaches as `X-Payment` header / relayer executes on-chain. x402 v2 is live; most active on **Base + Solana**. Arc-on-x402 support is ⚠️ **verify**. Adoption (late Apr 2026): ~69K agents, 165M txns, ~$50M volume. *(high)*

---

## 3. Mandate ⇒ Fireblocks Policy Engine mapping

| VAR Mandate field | Policy Engine control |
|---|---|
| Spend cap | per-wallet / per-delegation spend limit |
| Asset whitelist | merchant/asset allowlist + address whitelisting |
| Expiry | time windows |
| Revocable at will | policy revoke; multi-party approval workflows |
| Audit | full audit trail |

Policies sit **outside** the agent execution path — agents cannot change rules; applies uniformly to Console, API, and agent ops. This is the off-chain half of the Mandate. The **on-chain** enforcement half is VAR's own AgentBook (see §6). *(high)*

---

## 4. The Python ↔ Node seam (mandatory architecture decision)

**There is no Python SDK for Dynamic/Fireblocks agent-wallet delegated signing.** A Fireblocks *Python* SDK exists (`fireblocks/py-sdk`) but only covers Key Link signing (`set_agent_id`), **not** NCW agent-wallet delegation/transaction signing. The Dynamic agent SDK is `@dynamic-labs-wallet/node-*` (TypeScript) only.

**DECISION (locked):** VAR's FastAPI backend (`backend/src/agents/`) runs a **thin Node HTTP sidecar** (Express) exposing e.g. `POST /sign-transaction`. FastAPI builds the unsigned tx, POSTs to the sidecar, sidecar calls `delegatedSignTransaction(...)` → returns `0x…` → FastAPI broadcasts via `eth_sendRawTransaction`.

```
FastAPI agent loop ──HTTP──▶ Node sidecar (Express + @dynamic-labs-wallet/node-evm)
       ▲                            │
       └──── 0x signed tx ──────────┘ delegatedSignTransaction()
```

- Subprocess-spawn vs long-lived HTTP service: **prefer long-lived HTTP microservice** (health-checked, handles concurrency) over per-call subprocess. ⚠️ official "recommended" pattern not documented — this is VAR's call.
- **Budget ~100–500ms per signature** (async multi-round MPC + network). Fireblocks MPC-CMP = 1 signing round (8× GG18); MPC-BAM = 5× faster again. Do **not** promise sub-second in the demo script; frame the TEE round-trip as a security feature.
- ~6–8h of integration + testing. Off the hot path, so the "one VIEW call" invariant is intact.

---

## 5. Hot-path invariant — resolved

The VAR invariant ("hot path = ONE on-chain VIEW call, no paymaster/relayer/off-chain attestation") is **safe**:

- **ERC-7943 `canTransfer(address from, address to, uint256 amount) external view returns (bool allowed)`** — Final; **MUST NOT revert, MUST NOT change storage.** Pre-flight `canTransfer` is **OFF-PATH** UI-level validation (halt before gas). It does **not** count toward the in-band single-VIEW-call budget.
- In-band enforcement lives in `transfer`/`transferFrom`/`safeTransferFrom`, which MUST revert if `canTransfer` would be false. VAR's actual hot-path read at transfer time is **one** view call (ERC-8226 `isActiveForAmount` or the equivalent AgentBook check).
- MPC signing latency (§4) is also off-path — it happens before broadcast, not inside the transfer VIEW.

⚠️ **ERC-8226 `isActiveForAmount` is Draft and was NOT found shipped to any testnet/mainnet** in the data gathered. Treat the exact signature as **TBD** and implement VAR's own AgentBook view (see §6) rather than depending on a deployed standard. Do not fabricate the signature.

---

## 6. AgentBook — VAR builds this, World's AgentBook is identity-only

Critical distinction confirmed across rounds:

- **World's "AgentBook"** (`agentbook.world`) is a World-ID-verified agent **registry built on x402** — networks World Chain (`eip155:480`) + Base (`eip155:8453`). Registration: `npx @worldcoin/agentkit-cli register <agent-address>`. Proof-of-human = World ID **anonymous hash only** (no PII/biometrics). It is **proof-of-human delegation, NOT a spend-authority enforcer.**
- **VAR's AgentBook** must be VAR's **own on-chain registry contract** (Arc testnet), seeded/anchored by the World ID proof, exposing the transfer-time view the gated token calls:

```
token.transfer ──▶ ERC-7943 canTransfer ──▶ (ERC-8226 isActiveForAmount, sig TBD)
                                          ──▶ VAR AgentBook.isActive(agent, amount) → bool
```
Revocation climax = human revokes (Fireblocks policy revoke off-chain **and/or** a tx flipping VAR's AgentBook entry) → next block the on-chain VIEW returns false → transfers REVERT with an ERC-1404-style machine-readable reason. *(high for the World facts; the VAR AgentBook contract itself is to-build)*

**Adjacent standards (context, not dependencies):**
- **ERC-8004 (Trustless Agents):** live Jan 29 2026; Identity registry = ERC-721 "agent passport" NFT + Reputation + Validation. 45K+ agents in month one. Useful framing for VAR's "Agent Passport."
- **ERC-7943 (uRWA):** Final; `canSend`/`canReceive`/`canTransfer` compliance views.

---

## 7. What this unblocks for the build

- **YES** — provision + headlessly sign for an agent wallet on Arc testnet *today* (Node SDK `delegatedSignTransaction` → broadcast).
- **YES** — add Arc as `chainId 5042002` + RPC to any Dynamic frontend via `evmNetworks`.
- **YES** — enforce the off-chain Mandate (spend cap / allowlist / expiry / revoke) in Fireblocks Policy Engine, bound before delegation.
- **YES** — proof-of-human via World AgentKit registration; anchor that hash in VAR's own AgentBook.
- **YES** — x402 agent payment leg via EIP-3009 `transferWithAuthorization`, signed through the sidecar (Base/Solana confirmed; Arc ⚠️ verify).
- **DECISION** — Python↔Node sidecar is the agreed backend shape (§4).
- **DEFER to Q3 2026** — Arc *mainnet* signing/settlement; swap RPC + chainId at launch. Document migration for judges.
- **BOUNTY** — ETHGlobal NYC **June 12–14 2026**: Dynamic **$2K "Best Agentic Build"** ("give your AI agent a wallet… show autonomous onchain action"); part of Dynamic's ~$10K, five-track pool. Aligns with VAR. (Ledger also $10K agent-payments-security; Coinbase no explicit bounty found.)

### Trade study — Dynamic/Fireblocks vs Coinbase Agentic Wallet (decision input)
| | Dynamic/Fireblocks | Coinbase Agentic Wallet |
|---|---|---|
| Status | GA May 20 2026 | GA Feb 11 2026 |
| Signing latency | sub-second (~100–500ms, MPC rounds) | sub-200ms (CDP Server Wallets v2, TEE/Nitro) |
| SDK for backend | **Node-only** → sidecar needed | server wallets, x402-native, gasless on Base |
| Custom EVM (Arc 5042002) | confirmed (testnet) | ⚠️ verify custom-chain support |
| Bounty | **$2K Dynamic** | none found |
| Recommendation | **Choose for VAR** (bounty + Policy Engine = Mandate + Arc custom-chain confirmed) | fallback if latency-critical |

---

## 8. Residual open questions

1. **Delegation webhook schema gap (top risk):** Fireblocks NCW webhooks (`NCW_CREATED`, `NCW_ACCOUNT_CREATED`, `NCW_TRANSACTION_STATUS_UPDATED`, `NCW_ADD_DEVICE_SETUP_REQUESTED`) carry `{type, tenantId, timestamp, data{walletId, deviceId|accountId|...}}`, but the **`ServerKeyShare` / `walletApiKey` delegation fields are NOT in public docs.** Action: inspect `ncw-backend-demo` route handlers; if mismatch, engage Fireblocks support. *(blocker — actionable)*
2. **Arc mainnet:** exact date, pre-mainnet RC window, and whether testnet chainId/addresses are forward-compatible or require redeploy — all TBD.
3. **x402 on Arc:** is Arc testnet on the x402 Foundation supported-chains list, or is the agent→service leg Base/Solana-only? ⚠️ verify.
4. **Sidecar shape:** does Fireblocks ship an off-the-shelf HTTP signing proxy, or must VAR build the Express wrapper? (Assume build.) Concurrency + IPC overhead unmeasured.
5. **Policy sharing:** can one Fireblocks policy span multiple agent wallets, or one-policy-per-agent?
6. **Revocation timing:** does x402 / signing re-check World-ID revocation mid-flight, or only at signing time? (VAR's on-chain AgentBook VIEW closes this regardless.)
7. **World AgentKit ABI:** does World's AgentBook expose a queryable `isVerified(addr)` ABI, or is it off-chain metadata only?
8. **Dashboard ↔ Policy Engine:** does Dynamic's dashboard configure Fireblocks policies natively, or are policies set separately in the Fireblocks console?

### Known doc gotchas
- Some `docs.dynamic.xyz/docs/node-sdk/...` paths 404 intermittently (Fireblocks domain migration) — cross-reference `ncw-developers.fireblocks.com`.
- Don't trust any "Arc mainnet" RPC/address you find before official publication — mark TBD.

---

## 9. Sources

| # | Source | Used for |
|---|---|---|
| 1 | fireblocks.com/blog/agentic-payments-suite-psp-fintech | Agentic Suite GA, TSS-MPC, Policy Engine |
| 2 | prnewswire.com/news-releases/fireblocks-joins-x402-foundation-launches-agentic-payments-suite-302777251.html | May 20 2026 GA, x402 Foundation |
| 3 | dynamic.xyz/docs/node-sdk/reference/evm/delegated-sign-transaction | `delegatedSignTransaction` / `delegatedSignMessage` signatures |
| 4 | dynamic.xyz/docs/node-sdk/evm/sign-transactions | `getExternalServerKeyShares`, signing |
| 5 | dynamic.xyz/docs/node-sdk/reference/svm/get-svm-wallets | SVM key-share APIs |
| 6 | dynamic.xyz/docs/chains/evmNetwork | `evmNetworks` custom-chain config |
| 7 | docs.arc.io/arc/references/contract-addresses | Arc USDC addr, testnet-only status |
| 8 | chainid.network/chain/5042002 / chainlist.org/chain/5042002 | Arc chainId, RPC |
| 9 | drpc.org/chainlist/arc-testnet-rpc · alchemy.com/rpc/arc-testnet | Alt RPC endpoints |
| 10 | arc.io/blog/building-with-usdc-on-arc-one-token-two-interfaces | USDC dual-decimal interface |
| 11 | phemex.com/news/...arc-blockchain-whitepaper-mainnet-launch-set-for-summer-2026 | Arc mainnet "summer 2026" |
| 12 | fireblocks.com/blog/fireblocks-acquires-dynamic · dynamic.xyz/blog/dynamic-is-joining-fireblocks | Acquisition, Node-only SDK |
| 13 | ncw-developers.fireblocks.com/docs (backend-server-configuration, webhooks, create-transaction, main-capabilities) | NCW roles, 2-of-2 MPC, webhook schema, sign API |
| 14 | developers.fireblocks.com/docs/embedded-wallet-webhooks · /reference/webhooks-v2 | Webhook payload (no ServerKeyShare field) |
| 15 | github.com/fireblocks/{fireblocks-sdk-js, py-sdk, ncw-backend-demo} | SDK language support, demo backend |
| 16 | dynamic.xyz/docs/overview/ethglobal-new-york-2026 | $2K bounty, June 12–14 |
| 17 | world.org/blog/announcements/now-available-agentkit-proof-of-human-for-the-agentic-web · agentbook.world | World AgentKit, AgentBook registry |
| 18 | ercs.ethereum.org/ERCS/erc-7943 | `canTransfer` view, off-path semantics |
| 19 | eips.ethereum.org/EIPS/eip-8004 · kucoin.com/blog/understanding-erc-8004... | ERC-8004 agent identity / passport |
| 20 | eco.com/support/.../coinbase-agentic-wallets-explained · github.com/coinbase/cb-mpc | Coinbase trade-study, cb-mpc scope |
| 21 | cobo.com/post/what-is-x402 · academy.extropy.io/.../review-eip-3009.html | x402 metrics, EIP-3009 signature |
| 22 | fireblocks.com/blog/{pushing-mpc-wallet-signing-speeds-8x-with-mpc-cmp-9, announcing-the-fireblocks-mpc-bam-protocol, agents-next-wave-wallet-users} | MPC latency (CMP/BAM) |
