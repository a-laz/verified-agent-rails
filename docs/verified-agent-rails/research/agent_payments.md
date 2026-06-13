# Agent Payments — Verified Agent Rails (VAR)
*How a World-ID-anchored agent autonomously pays for a service in USDC on Arc, with on-chain accountability and a one-click revoke.*

**Feasibility verdict: FEASIBLE on Arc testnet NOW (partial for mainnet).** The payment leg maps cleanly onto a production-proven 2026 stack — x402 for HTTP-native API payment discovery, EIP-3009 gasless USDC authorization, ERC-7943 `canTransfer` (Final) as the on-chain gate, World AgentKit for proof-of-human. **The single load-bearing gap is the mandate-resolver standard:** the VAR-canonical "ERC-8226 `isActiveForAmount`" does **not** appear in the official Ethereum EIPs registry. Round 2 reported it as a verified on-chain VIEW (Draft/Review); Rounds 3–5 searched the EIPs list and found nothing. **Treat the `isActiveForAmount` interface as VAR-defined (custom `IEligibilityResolver`) and pin it in hour 0 before any Solidity is written.** ⚠️ verify the ERC number. Arc **mainnet is not live** (Circle target: "summer 2026", no date as of 2026-06-13) — ship the demo on Arc **testnet**, fall back to Base if Arc slips.

---

## 1. The hot-path resolution (the key architectural insight)

VAR's invariant — *"hot path = ONE on-chain VIEW call; no paymaster, no relayer, no off-chain attestation in the hot path"* — appears to conflict with x402, which has an off-chain "facilitator." **It does not conflict.** Across Rounds 2–5 this was the central finding (high confidence):

| Layer | Where | What it does | Touches eligibility? |
|---|---|---|---|
| **Payment discovery / authorization** | OFF-chain (x402 facilitator: Coinbase or Circle Gateway) | Validates the EIP-712/EIP-3009 **signature** + balance, batches settlement | **NO** |
| **Eligibility / compliance enforcement** | ON-chain at transfer time (all VIEW calls) | `canTransfer → isActiveForAmount → AgentBook` | **YES** |

The facilitator **never** decides whether the agent is *eligible* — it only proves a cryptographic signature is valid and forwards the payment to on-chain settlement. The transfer-blocking decision lives entirely in the gated token's `canTransfer` hook. So the no-off-chain-attestation invariant is **preserved** regardless of whether x402 negotiated the API call. *(Confidence: high; Rounds 2–5, derived from x402.org + EIP-8226/7943 spec analysis + VAR VISION.md.)*

### Hot-path call chain (canonical)

```solidity
token.transfer(to, amount)
  -> _beforeTokenTransfer(from, to, amount)
    -> canTransfer(from, to, amount)                      // VIEW, ERC-7943 (Final)
       -> resolver.isActiveForAmount(agentId, principal, amount)  // VIEW, CUSTOM (not a published ERC) ⚠️
          -> agentBook.resolveHuman(agentWallet)          // VIEW, World-ID-seeded
       -> return (mandate active && amount within caps && human verified)
// Ineligible -> REVERT with machine-readable code (ERC-1404-style; encoding TBD)
```
*(Confidence: high for the ERC-7943 leg; the `isActiveForAmount` + `AgentBook` legs are VAR-defined interfaces, not external standards.)*

---

## 2. The payment decision: x402 vs. direct USDC transfer

**They are complementary, not competing** (Rounds 2–5, high confidence). x402 is the **discovery + authorization** transport; the on-chain ERC-20 transfer (or EIP-3009 batch) is **settlement**. Both flow through the same `canTransfer` gate.

| Option | Use for | Demo visibility | Gas | VAR fit |
|---|---|---|---|---|
| **Plain USDC transfer** (ERC-20, 6-dec) | **MVP** — agent pays merchant | **Visible per-tx in explorer** | ~$0.01 on Arc testnet | Simplest, no facilitator dependency, best for live demo "see it land" |
| **x402 + Circle Nanopayments** | **STRETCH** — true micropayments | **Batched off-chain — NOT visible per-tx** | gasless (EIP-3009) | Production-standard, sub-cent, but judges won't see individual txns |

**Recommendation (Rounds 2 & 4):** Use **plain on-chain USDC transfer on Arc testnet for the MVP** (explorer-visible settlement is worth more than sub-cent economics in a demo). Keep x402 as the documented stretch path — the settlement still passes through `canTransfer`, so adopting it later is no re-architecture.

### x402 production status (verified, high confidence, Rounds 1–5)
- 165M+ transactions, ~$50M cumulative volume by late April 2026; ~75M txns/month; 69K active agents; avg tx ~$0.30.
- Launched Coinbase + Cloudflare Sept 2025; moved to **Linux Foundation** governance April 2026 (backers: Circle, Google, Microsoft, Stripe, Visa, AWS).
- **Agent.market** directory (April 2026): 1,166+ x402-paywalled services across reasoning/data/media/search/social/infra/trading.
- Stripe x402 (Feb 10, 2026, preview) charges agents USDC on Base via PaymentIntents. AWS Bedrock AgentCore Payments preview (May 2026).
- Zero protocol fees (only on-chain gas, ~$0.0001 on Base L2).

---

## 3. Concrete artifacts (build against these)

### EIP-3009 `transferWithAuthorization` (gasless USDC auth — the x402 settlement primitive)
```solidity
function transferWithAuthorization(
    address from,
    address to,
    uint256 value,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,      // random 32-byte; enables concurrent txns, replay-safe
    uint8   v,
    bytes32 r,
    bytes32 s
) external;
```
EIP-712 signed, chain-ID + contract-specific (non-replayable). USDC v2 (Circle) implements it. No gas for the signer; facilitator submits. *(Confidence: high; eips.ethereum.org/EIPS/eip-3009.)*

### ERC-7943 `canTransfer` (FINAL — May 27, 2026 — the on-chain gate) ✅
```solidity
function canTransfer(address from, address to, uint256 amount)
    external view returns (bool allowed);
// Some refs show a 2-tuple form returning a status code:
//   returns (bool canTransfer_, bytes memory statusCode)
```
READ-ONLY view (no revert, no state change). Internal logic checks: unfrozen balance (`total - frozen`) ≥ amount, `canSend(from)`, `canReceive(to)`. Universal RWA standard; production-ready coalition (CMTA/CMTAT, Chainlink ACE). *(Confidence: high.)* ⚠️ Two return-shape variants appear across rounds — **pin the exact ABI** from the Final spec before coding the decoder.

### ERC-8226 `isActiveForAmount` — VAR's mandate resolver ⚠️ NOT A PUBLISHED ERC
Round 2 reported this as a verified on-chain VIEW (Draft→Review):
```solidity
// CLAIMED interface (Round 2) — VERIFY before relying on the ERC number
function isActiveForAmount(uint256 agentId, address principal, uint256 amount)
    external view returns (bool);
// Checks: (1) isActive(agentId, principal); (2) amount within per-tx limit;
//         (3) cumulative usage + amount within cap.
```
**Rounds 3, 4, 5 searched eips.ethereum.org, ethereum/EIPs, Ethereum Magicians, GitHub — zero results for ERC-8226 / EIP-8226.** Nearest real standards: ERC-8126 (AI Agent Verification), ERC-8004 (Trustless Agents identity), ERC-8183 (Agentic Commerce escrow), ERC-3643 (permissioned tokens). **Conclusion: treat `isActiveForAmount` as a VAR-internal `IEligibilityResolver` you implement yourself.** Suggested 3-function resolver: `grantMandate`, `revokeMandate`, `isActiveForAmount`. *(Confidence on non-existence: high. Confidence on Round-2 signature: low — unverified against any public spec.)*

### ERC-8004 Trustless Agents (FINAL — Jan 29, 2026 — optional identity layer) ✅
45K+ agents registered. Three registries: Identity (ERC-721 + URIStorage), Reputation, Validation.
```solidity
function register(string memory agentURI) external returns (uint256 agentId);
function getAgentWallet(uint256 agentId) external view returns (address wallet);
function setAgentWallet(uint256 agentId, address wallet) external; // EIP-712 proof variant exists
function setAgentURI(uint256 tokenId, string calldata newURI) external;
```
Optional for VAR's MVP; useful if AgentBook is built as an on-chain identity registry rather than a sidecar mirror. *(Confidence: high.)*

### Arc testnet — network facts (pin these)
| Field | Value | Confidence |
|---|---|---|
| USDC contract (precompile) | `0x3600000000000000000000000000000000000000` | high |
| Decimals | **Dual:** 18 native (gas) / **6 ERC-20 (use this for all logic)** | high |
| Chain ID | `5042002` | high |
| RPC | `https://rpc.testnet.arc.network` (alts: Alchemy, dRPC, ThirdWeb) | high |
| Explorer | `https://testnet.arcscan.app` | high |
| Faucet | `https://faucet.circle.com` (20 USDC / 2h) | high |
| Native gas token | USDC (no volatile ETH gas) | high |
| Mainnet | **NOT LIVE** (target "summer 2026"); address/chainId/RPC **TBD** | high |

**Dual-decimal trap (high confidence, repeated every round):** one token, two interfaces synced by a precompile. **Always use the 6-decimal ERC-20 interface** for `balanceOf`/`transfer`/`approve`. Mixing interfaces double-counts. `1e18 native = 1e6 ERC-20`.

### x402 HTTP 402 flow + headers
```http
1. Client: GET /api/data HTTP/1.1
2. Server: HTTP/1.1 402 Payment Required
   # Header-style (Round 5):
   X-Payment: <merchant-address>
   X-Token:   <USDC-contract-address>
   X-Network: <chain-id>
   X-Amount:  <amount-in-smallest-unit>
   X-Nonce:   <replay-prevention-nonce>
   # Body-style "accepts" array (Round 1/4, x402 v1/v2):
   { "x402Version": 1, "error": "Payment Required",
     "accepts": [{ "scheme": "exact", "network": "base",
       "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC on Base
       "payTo": "0x...", "maxAmountRequired": "1000",          // $0.01 (6-dec)
       "resource": "https://.../price-feed", "description": "Live feed" }] }
3. Client signs EIP-712 / EIP-3009 authorization
4. Client: GET /api/data  with  X-PAYMENT: base64(signed proof)
5. Facilitator verifies signature + balance, settles (batched), returns receipt
6. Server: 200 OK + resource
```
*(Confidence: high. Note the header naming differs across implementations — `X-Payment` vs `X-PAYMENT`/`X-PAYMENT-SIGNATURE`/`PAYMENT-REQUIRED`. Pin against your chosen facilitator's actual docs.)* ⚠️ verify exact header casing per facilitator.

### x402-axios transparent interceptor (agent code stays clean)
```ts
import { withPaymentInterceptor } from 'x402-axios';
import { privateKeyToAccount } from 'viem/accounts';
import axios from 'axios';

const account = privateKeyToAccount(privateKey);
const client = withPaymentInterceptor(
  axios.create({ baseURL: 'https://api.example.com' }),
  account
);
// On 402, interceptor extracts requirements, signs EIP-712, retries with X-PAYMENT — transparent
const response = await client.get('/premium-data');
```
*(Confidence: high; npm `x402-axios` + viem.)*

### Coinbase AgentKit x402 pay-for-service (CLI, x402-native)
```bash
npx awal@latest x402 pay https://api.example.com/research \
  -X POST -d '{"company":"Acme"}' --max-amount 0.005 --json
```
*(Confidence: high.)*

### Dynamic agent-wallet signing from Python (the documented bridge)
```python
# Dynamic agent-wallet SDK is Node-only (@dynamic-labs-wallet/node-evm).
# No confirmed Python SDK as of 2026-06-13. FastAPI loop must bridge:
# Option A (recommended): thin Node HTTP sidecar
response = requests.post('http://localhost:3000/sign',
    json={'walletId': wallet_id, 'transaction': serialized_tx})
signed_tx = response.json()['signedTx']
# Option B: subprocess call into the Node SDK (blocks on Node lifetime)
```
*(Confidence: medium — flagged ⚠️ verify in VAR docs across Rounds 2–5. HTTP sidecar is lower-risk than subprocess; budget ~2–3h.)*

---

## 4. World ID anchoring & one-click revocation

- **World AgentKit** (beta, March 17, 2026) links a World ID-verified human to N agents via ZK proofs; integrates with Coinbase x402. ~18M Orb-verified humans. **Directly enables VAR's World-ID-anchored AgentBook.** *(High confidence.)*
- **Nullifier is deterministic** per `(human, rpId, action)`. Once a `nullifierHash` is used it cannot be cleared on an active contract. **Demo repeatability mechanism (Round 4, high confidence): vary the `externalNullifierHash` / action ID per run — do NOT attempt on-chain state reset.** Alternatively use World ID **Simulator** (`simulator.worldcoin.org`) for unlimited test identities without an Orb visit.
- **groupId = 1** = Orb-verified (iris). Live demo with real humans needs prior Orb enrollment; simulator covers dev. ⚠️ confirm `groupId=1` constant for your contract path.
- **One-click revoke:** human revokes from phone → next block the agent's `isActiveForAmount` returns false → `canTransfer` blocks → transfer **reverts**. The exact on-chain mechanism (state-var flip vs. token freeze vs. event-listener) is **VAR-defined / TBD** — design it as a single state write on the resolver/AgentBook so the very next VIEW read flips. *(Confidence: high on the outcome; mechanism is VAR's to build.)*

---

## 5. Supporting ecosystem (verified, for context / stretch)

- **Circle Nanopayments** — mainnet-live May 3, 2026 across 11 chains incl. **Arc testnet**. EIP-3009 gasless, min $0.000001, batched off-chain settlement (not per-tx visible). The x402 settlement vehicle on Arc. *(High.)*
- **MCP** is the wire format for tool invocation (JSON-RPC 2.0) and **does not move dollars** — x402 sits *inside* MCP tool calls (tool returns 402 → agent signs → retries). Final MCP spec July 28, 2026. *(High.)* If VAR's agent is MCP-aware, x402 layers in natively.
- **Skyfire KYAPay** (IETF draft, May 17 2026) — **complementary** Know-Your-Agent identity+payment JWT layer (`hid`/`apd`/`aid`/`pay` claims, ES256). Not required for MVP; optional STRETCH for agent-identity claims. Fastly edge partnership June 2026. *(High.)*
- **ERC-8183** (Agentic Commerce escrow, Draft Feb 25 2026) — agent-hires-agent / job escrow. Relevant only if VAR adds agent-to-agent cashout. *(High.)*
- **Agent wallet landscape (June 2026):** Coinbase Agentic Wallets (x402-native, MPC/TEE, Feb 11) · Dynamic Labs (TSS-MPC, chain-agnostic, Node-only SDK) · MetaMask Agent Wallet (early access June 8) · MoonPay Agents · Trust Wallet Agent Kit. **Recommendation: Coinbase Agentic for x402-first simplicity; Dynamic if multi-chain/key-control is a hard requirement** (VAR spec names Dynamic → budget the Node bridge).

---

## 6. What this unblocks for the build

1. **Settlement leg decided:** plain USDC ERC-20 transfer on **Arc testnet** for MVP (explorer-visible); x402 + Nanopayments as documented stretch. Both pass through `canTransfer`.
2. **Hot path is real and invariant-safe:** `canTransfer (ERC-7943) → isActiveForAmount (custom) → AgentBook` — all VIEW, on-chain. No paymaster/relayer/off-chain attestation in the blocking path.
3. **Gate primitive locked:** ERC-7943 is **Final** — build against it with confidence (not a moving draft).
4. **Identity locked:** World AgentKit (live) seeds AgentBook; demo repeatability via distinct action IDs / simulator.
5. **Parallel lanes:** Lane A (contracts: custom `IEligibilityResolver` + GatedToken/ERC-7943 + AgentBook mirror) can run in parallel with Lane B (agent loop: Dynamic Node sidecar + USDC transfer / x402) and Lane C (UI grant/revoke panel) — **once the resolver interface is pinned in hour 0.**
6. **Migration path:** Arc mainnet launch = redeploy + repoint RPC/addresses, **not** a re-architecture. Pin testnet for the hackathon.

---

## 7. Residual open questions (ordered by build-blocking severity)

1. **🔴 Hour-0 blocker — the mandate-resolver standard.** "ERC-8226" is not a published ERC. Decide: ship a custom `IEligibilityResolver(grantMandate, revokeMandate, isActiveForAmount)`, or adopt ERC-8126/ERC-8183, or confirm the real ERC number VAR meant. **Lock before any Solidity.** Verify against `contracts/box_schemas.md` / `AGENTS.md`.
2. **🟠 Cross-chain eligibility.** AgentBook / World ID live on World Chain / Base; gated token + settlement on Arc. Does `isActiveForAmount` resolve AgentBook via a **mirror, bridge, or oracle**? Current assumption: **local mirror** for a same-chain VIEW call. Decide before mainnet.
3. **🟠 Revocation mechanics on-chain.** Exact "one-click revoke" implementation (state-var flip vs. freeze vs. event listener) and failure mode if the revoke tx doesn't land next block. VAR must implement and test.
4. **🟡 ERC-7943 revert/status encoding.** `canTransfer` return shape (bool vs. `(bool, bytes statusCode)`) and how ERC-1404-style machine-readable codes (no-passport / over-cap / expired / asset-not-whitelisted) are encoded in revert data → drives the UI decoder.
5. **🟡 Dynamic Python gap.** Confirm no Python signing SDK; commit to Node HTTP sidecar (~2–3h). Verify webhook payload shape (`walletId`/`walletApiKey`/`keyShare`) and `ServerKeyShare` fields against Dynamic docs.
6. **🟡 `isActiveForAmount` gas cost** on Arc testnet — profile to protect the "single cheap VIEW call" narrative.
7. **🟡 Demo settlement visibility.** Nanopayments batches off-chain (invisible per-tx). For demo, prefer plain USDC transfer (visible). Confirm whether the x402 facilitator can be configured for per-tx confirmation.
8. **⚪ Arc mainnet date** ("summer 2026", unconfirmed) — mainnet USDC address / RPC / fee structure TBD. Watch Circle's announcement.
9. **⚪ Real x402 API for the demo beat** — does Agent.market host a usable API, or host a mock x402 endpoint?

---

## 8. Sources

| # | Source | Used for |
|---|---|---|
| 1 | https://eips.ethereum.org/EIPS/eip-3009 | `transferWithAuthorization` signature (high) |
| 2 | https://eips.ethereum.org/EIPS/eip-7943 | `canTransfer` Final hook (high) |
| 3 | https://eips.ethereum.org/EIPS/eip-8004 | ERC-8004 identity registry (high) |
| 4 | https://eips.ethereum.org/EIPS/eip-712 | EIP-712 typed-data signing (high) |
| 5 | https://eips.ethereum.org/erc · https://github.com/ethereum/EIPs | ERC-8226 **absence** confirmed (high) |
| 6 | https://x402.org · https://docs.x402.org/core-concepts/http-402 | x402 flow + headers (high) |
| 7 | https://www.chainalysis.com/blog/x402-agentic-payments-adoption/ | x402 production metrics (high) |
| 8 | https://aws.amazon.com/blogs/industries/x402-and-agentic-commerce-redefining-autonomous-payments-in-financial-services/ | x402 backing/flow (high) |
| 9 | https://github.com/fernsugi/x402-api-server | 402 response structure + retry header (high) |
| 10 | https://zuplo.com/blog/mcp-api-payments-with-x402 | x402-axios interceptor (high) |
| 11 | https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service · coinbase agentic-wallets launch | Coinbase AgentKit, awal CLI (high) |
| 12 | https://www.circle.com/blog/nanopayments-powered-by-circle-gateway-is-now-live-on-mainnet · /circle-nanopayments-launches-on-testnet | Nanopayments mainnet, EIP-3009 batching (high) |
| 13 | https://developers.circle.com/gateway/nanopayments | EIP-3009 in Nanopayments (high) |
| 14 | https://www.arc.io/ · https://docs.arc.io/arc/references/contract-addresses · https://www.arc.io/blog/building-with-usdc-on-arc-one-token-two-interfaces | Arc testnet USDC, dual-decimal, RPC, chainId (high) |
| 15 | https://testnet.arcscan.app · https://faucet.circle.com | Arc explorer + faucet (high) |
| 16 | https://phemex.com/news/...arc-blockchain-whitepaper-mainnet-launch-set-for-summer-2026 | Arc mainnet "summer 2026" (high) |
| 17 | https://world.org/blog/announcements/now-available-agentkit-proof-of-human-for-the-agentic-web · coindesk 2026-03-17 · techcrunch 2026-03-17 | World AgentKit beta, human→N agents (high) |
| 18 | https://docs.world.org/world-id/reference/contracts · https://simulator.worldcoin.org/ | Nullifier determinism, groupId=1, simulator (high) |
| 19 | https://eco.com/support/en/articles/14845480-mcp-and-payments-a-2026-guide | MCP×payment layering (high) |
| 20 | https://skyfire-xyz.github.io/kyapay-ietf-draft/ · https://datatracker.ietf.org/doc/draft-skyfire-kyapayprofile/ · https://kyapay.org/ | KYAPay JWT spec (high) |
| 21 | https://www.kucoin.com/news/...erc-8183... · https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098 | ERC-8183 escrow, ERC-8004 registries (high) |
| 22 | https://www.dynamic.xyz/blog/introducing-dynamic-embedded-wallets-with-tss-mpc · https://www.dynamic.xyz/ | Dynamic TSS-MPC, Node-only SDK (medium) |
| 23 | https://www.theblock.co/post/389352/stripe-adds-x402-integration-usdc-agent-payments | Stripe x402 (high) |
| 24 | https://www.coinbase.com/developer-platform/discover/launches/agentic-market | Agent.market directory (high) |
| 25 | VAR internal: VISION.md / 04_INTEGRATIONS.md / 06_BUILD_PLAN.md / AGENTS.md | hot-path invariant, MVP choices, blockers (high) |

*Confidence legend: high = verified against primary source(s); medium = single/secondary source or inference; low / ⚠️ verify = unconfirmed, treat as TBD. No addresses, signatures, or APIs are fabricated — anything unverified is marked TBD or ⚠️.*
