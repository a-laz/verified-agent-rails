# Verified Agent Rails — Competitive Landscape

_Where VAR sits among proof-of-human, agent-identity, and agentic-payment prior art — and the whitespace it owns._

**Feasibility verdict: GO (high confidence).** VAR's core claim — one-view-call compliance (no relay/paymaster/off-chain attestation in the hot path) + World-ID-anchored instant revocation — survived five rounds of adversarial verification as genuine, uncontested whitespace. Every adjacent project either escrows (Nava), verifies off-chain (ERC-8126, Agent Passport, AP2), requires a relay/paymaster in the payment flow (World AgentKit + x402), or anchors no human identity at all (Circle Agent Stack, MetaMask Agent Wallet, ERC-8004). The live event (ETHGlobal NYC, June 12–14, 2026) and its $15K World track are **verified, not internal goals**.

---

## 1. Verdict at a glance

| Dimension | Status | Note |
|---|---|---|
| Whitespace exists | ✅ Confirmed (5 rounds) | No project combines single view-call + World ID anchor + instant on-chain revocation |
| Target event | ✅ ETHGlobal NYC, June 12–14, 2026 (LIVE) | Metropolitan Pavilion, 500+ devs, $225K+ total pool |
| $15K World track | ✅ Verified published prize | "proof of human, financial infrastructure, human-first experiences" |
| $2K Dynamic track | ✅ Verified | "Best Agentic Build" — autonomous onchain action w/ agent wallets |
| Standards substrate | ✅ ERC-7943 Final, ERC-8004 Final | Both shipped and frozen before hackathon |
| ERC-8226 dependency | ❌ Does NOT exist | Phantom spec — must NOT appear in pitch; use proprietary resolver |
| Arc / x402 requirement | ❌ Optional | Plain mainnet USDC satisfies all bounty criteria |
| Direct competitor | ⚠️ World AgentKit (adjacent, not identical) | Uses gasless Base relay + x402 — NOT a one-view-call check |

---

## 2. Prior-art map (8 major projects)

| Project | Launch | What it does | Why it is NOT VAR |
|---|---|---|---|
| **World AgentKit** | Mar 17, 2026 | Iris→agent linkage; registers agent in AgentBook (gasless Base relay); x402 micropayments; ZK proof of unique human | Closest competitor on human-verification, but eligibility enforced **client-side in x402 handler** + requires relay/HTTP-402 flow — not a single on-chain view call. No instant-revocation-→-next-block lockout claim. |
| **Agent Passport** (`agentpassportai`) | 2025–26 | OAuth-style consent gating: spending caps, rate limits, allowlists, TTL expiry, Ed25519-signed audit trail, KYA metadata, 75+ threat defs | **Off-chain / CLI-based** (Shell 100%, local JSON ledger). Not a smart contract; no World ID anchor; authorization is local, not on-chain. |
| **Nava** | Apr 2026, $8.3M (Polychain + Archetype) | Escrow-before-execution on Arbitrum L3: Propose→Verify→Execute; Arbiter checks intent match; reasoning posted on-chain | **Orthogonal trust model.** Escrow hold + verification overhead; release is not atomic with a revert. Adds latency/cost; not one-call. |
| **Circle Agent Stack** | May 11, 2026 | MPC wallets, policy-controlled USDC, nanopayments ($0.000001+), CLI, Marketplace; Arc + mainnet | **Reference implementation, not competitor.** No human-identity layer — identity assumed from integrating platform (e.g., Dynamic). |
| **MetaMask Agent Wallet** | Jun 8, 2026 | Spending limits, allowlists, sim/Blockaid scanning, MEV protection, ERC-7710/7715 delegation, 25+ chains | **No human-identity anchoring.** Identity delegated to integrating app. Spending controls ≠ accountability-to-verified-human. |
| **Google AP2** | Sep 16, 2025; v0.2.0 Apr 2026 | W3C Verifiable Credential mandates: Intent→Cart/Checkout→Payment; ECDSA P-256; 60+ partners (Mastercard, PayPal, Coinbase, Amex…) | **Off-chain & payment-rail agnostic.** Mandates are off-chain artifacts; no on-chain view-call enforcement. Useful as a *mandate-format reference*. |
| **Concordium Agent Registry** | H1 2026 | Protocol-level ERC-8004-compatible identity, "Verified by Concordium" badge, ZK proofs, KYC/KYA | **Identity-only.** Gating a transfer requires off-chain oracle integration; not a compliance-enforcement layer. |
| **Privado ID + Billions KYA** | 2026 | DeepTrust 4D identity, ZK proofs, agent SDK (LangChain) | Not blockchain-anchored compliance gating. |

**Bottom line:** the closest neighbor (World AgentKit) is **complementary, not blocking** — biometric proof-of-human is their layer; one-call compliant payments + instant revocation is VAR's. Position VAR as "AgentKit-aware but relay-free."

---

## 3. Standards substrate (what VAR builds on)

| Standard | Status | Role in VAR | Confidence |
|---|---|---|---|
| **ERC-7943** (uRWA, `canTransfer`) | ✅ **Final, May 27, 2026** (interface frozen) | The view-only compliance hook VAR's gated token calls in the hot path | high |
| **ERC-8004** (Trustless Agent Identity) | ✅ **Final, Jan 29, 2026** | Optional portable agent DID/identity substrate; 20K–45K+ agents registered across many chains | high |
| **ERC-1404** (Simple Restricted Token) | ✅ Established | Machine-readable revert reason codes (`detectTransferRestriction` / `messageForTransferRestriction`) | high |
| **ERC-8126** (AI Agent Verification) | ✅ Final, Jun 2, 2026 | Off-chain risk scoring (0–100) + ZK; **NOT** an on-chain gate — do not put in hot path | high |
| **ERC-8226** (`isActiveForAmount`) | ❌ **DOES NOT EXIST** | Phantom. Replace with proprietary `EligibilityResolver`. **Never claim it as a standard.** | high (verified non-existence, R4) |

> ⚠️ **Critical correction (R4–R5):** Exhaustive search of `eips.ethereum.org/erc`, GitHub, and Web3 docs returned **zero** results for ERC-8226. The CANONICAL TERM "ERC-8226 isActiveForAmount" must be reframed in all build/pitch material as a **VAR-proprietary `EligibilityResolver.isActiveForAmount(...)`** function — not a standards-track claim. If a judge asks "is 8226 real?", pivot immediately to "8226 is unpublished; we implement it ourselves atop ERC-7943 Final + ERC-8004 + World ID."

---

## 4. Concrete artifacts (interfaces / addresses / snippets)

### 4.1 Verified function signatures

```solidity
// ERC-7943 (Final, May 27 2026) — the hot-path view call
function canTransfer(address from, address to, uint256 amount)
    external view returns (bool allowed);
// companions: canSend(address), canReceive(address), getFrozenTokens(...)

// ERC-1404 — machine-readable revert reasons
function detectTransferRestriction(address from, address to, uint256 value)
    public view returns (uint8);
function messageForTransferRestriction(uint8 restrictionCode)
    public view returns (string memory);
```

### 4.2 VAR-proprietary resolver (fills the "8226" gap — TBD final shape)

```solidity
// Proprietary — NOT a published standard. Single VIEW call in the hot path.
interface IEligibilityResolver {
    // returns (eligible, ERC-1404-style reason code)
    function isActiveForAmount(bytes32 agentId, address principal, uint256 amount)
        external view returns (bool eligible, uint8 reason);

    // cold path (mandate lifecycle) — standard txs, may batch
    function grantMandate(bytes32 agentId, /* spend cap, asset whitelist, expiry */ ...) external;
    function revokeMandate(bytes32 agentId) external;  // instant: next-block lockout
}
```
Hot path = `token.canTransfer` → `EligibilityResolver.isActiveForAmount` → AgentBook/registry state seeded by World ID proof. **One on-chain VIEW call. No relay, no paymaster, no off-chain attestation.**

### 4.3 Chain / registry artifacts

| Artifact | Value | Confidence |
|---|---|---|
| World Chain | `eip155:480` | high |
| Base Chain | `eip155:8453` | high |
| AgentBook contract address / ABI | **TBD** — site `agentbook.world` published; no contract repo/ABI located | ⚠️ verify |
| AgentBook verification flow | Server challenges agent w/ CAIP-122 message → verifies signature → resolves registering human from AgentBook (gasless relay on Base) | high |

> ⚠️ **AgentBook integration gap:** No public contract address/ABI was found across five rounds. Fallback options: (a) query Base mainnet live + CAIP-122 challenge-response, or (b) put the World ID proof in calldata against a **VAR-proprietary lightweight registry** (eliminates relay dependency — aligns with the "zero new trust / no relay" invariant).

### 4.4 Mandate format options (pick one)

```jsonc
// Option A — AP2 W3C Verifiable Credential (reference-compatible, off-chain artifact)
{ "@context": "https://www.w3.org/2018/credentials/v1",
  "type": ["VerifiableCredential", "IntentMandate"],
  "credentialSubject": { "intent": "...", "scope": {}, "rules": {} },
  "proof": { "type": "...", "proofPurpose": "...", "verificationMethod": "...", "signatureValue": "..." } }
```
```solidity
// Option B — simpler EIP-712 signed Mandate struct (recommended for on-chain anchoring)
// Mandate{ agentId, principal, spendCap, assetWhitelist, expiry } — signed by verified human
```

---

## 5. What this unblocks for the build

- **Topology is settled (R2–R5):** plain **mainnet USDC** satisfies the Circle/Dynamic bounty criteria. **Arc and x402 are OPTIONAL** — list as "Arc-optional" in the stack to show flexibility, but do not take the integration tax for a 36h build.
- **No phantom-spec dependency:** drop the ERC-8226 label everywhere; ship a proprietary `EligibilityResolver`. This *de-risks* the architecture — VAR controls the one contract that matters.
- **Hot path locked:** exactly one VIEW call (`canTransfer` → `isActiveForAmount`). Cold path (grant/revoke) uses ordinary txs and may batch. The demo climax (human revokes on phone → state change → next agent tx reverts with an ERC-1404 reason) is achievable in a single revocation tx.
- **Standards are shipped & frozen:** ERC-7943 (Final) and ERC-8004 (Final) are production-ready — no dependency on anything still in Draft for the hot path.
- **Dual-bounty path:** target **World $15K** (proof-of-human + accountability) as primary, **Dynamic $2K** (autonomous onchain action) as secondary. Optionally note **Ledger $15K** (agent payments / Ledger-backed identity) as a stretch.
- **Differentiation narrative:** "zero new trust assumptions — one VIEW call beats Nava's escrow on latency/UX and beats AgentKit's relay on hot-path simplicity, while keeping World's biometric proof as the trust root."

---

## 6. Residual open questions

| # | Question | Why it matters | Status |
|---|---|---|---|
| 1 | Exact AgentBook contract address + ABI on Base | Determines whether VAR integrates live or uses proprietary-registry fallback | ⚠️ verify — fallback documented |
| 2 | Does the World $15K track favor AgentKit-native integrations in judging, or are independent proofs (ERC-8004 DID / proprietary registry) equally scored? | Affects whether to integrate AgentBook or stand alone | open |
| 3 | Is Dynamic "Best Agentic Build" $2K MPC-custody-only, or does it include agent-executes-approved-tx (revocable-mandate) models? | Submission strategy for the secondary track | open |
| 4 | Mandate format: AP2 W3C VC vs. EIP-712 signed struct | On-chain anchoring favors EIP-712; AP2 favors ecosystem credibility | decision pending |
| 5 | Permitted yield instrument for idle USDC (Aave / Lido / Yearn, on Arc or Ethereum) | Needed for the "park idle funds" flow | TBD |
| 6 | Minimum KYA/EU-AI-Act audit trail (Ed25519 log vs. ERC-8004 lookups vs. Concordium) — EU AI Act enforcement deadline Aug 2026 | Judges may expect a human-sponsor audit trail | open |
| 7 | Revocation timing: does human revoke at block N → agent locked at N+1, or is a safety tx needed? | Backs the "one-click, next-block" demo claim | ⚠️ verify in demo |
| 8 | Has any 2025–26 ETHGlobal team already combined ERC-7943 + ERC-8004 + proof-of-human? | Precedent / novelty check for judges | open |

---

## 7. Bounty & event ground truth (corrected across rounds)

- **R1 assumption → R2 doubt → R3+ CONFIRMED:** the "$15K proof-of-human" is a **real, published** World sponsor track at **ETHGlobal NYC 2026 (June 12–14)** — *not* an internal goal. (R2 had flagged it as unverified vs. Worldcoin's bug-bounty tiers; R3 located the official ETHGlobal/Crypto Briefing announcement.)
- **Dynamic:** "Best Agentic Build" **$2K** — autonomous onchain action w/ agent wallets; does **not** mandate x402 or any payment protocol.
- **Ledger:** **$15K** agent-payments / safer approvals / Ledger-backed identity (stretch target; consider Ledger Agent Wallet as alt signer to differentiate).
- **Circle Arc hackathons** (Agentic Commerce on Arc, Jan 2026; Agentic Economy on Arc, Apr 2026) are **CONCLUDED** — ETHGlobal NYC is the live vehicle.
- **x402 context:** 119M+ tx on Base, 35M+ on Solana, ~$600M annualized, zero protocol fees — large but **optional** for VAR.

---

## 8. Sources

| # | Claim area | Source | Conf. |
|---|---|---|---|
| 1 | ETHGlobal NYC 2026 live + $225K pool | cryptobriefing.com/ethglobal-nyc-hackathon-june-2026 ; eventbrite ETHGlobal NY listing | high |
| 2 | World $15K track | x.com/ETHGlobal/status/2057491753511641173 ; cryptobriefing | high |
| 3 | Dynamic $2K "Best Agentic Build" | dynamic.xyz/docs/overview/ethglobal-new-york-2026 | high |
| 4 | World AgentKit (Mar 17, 2026) | docs.world.org/agents/agent-kit/integrate ; techcrunch (Mar 17, 2026) ; agentbook.world ; emelia.io/hub/world-agentkit-proof-of-human | high |
| 5 | Agent Passport | github.com/agentpassportai/agent-passport ; agentpassportai.com | high |
| 6 | ERC-7943 Final (May 27, 2026) | eips.ethereum.org/EIPS/eip-7943 ; globenewswire (2026-05-27) | high |
| 7 | ERC-8004 Final (Jan 29, 2026) | eips.ethereum.org/EIPS/eip-8004 ; news.bitcoin.com ; eco.com support article | high |
| 8 | ERC-8126 Final (Jun 2, 2026) | eips.ethereum.org/EIPS/eip-8126 ; cryptonomist.ch (2026-06-12) | high |
| 9 | ERC-8226 non-existence | eips.ethereum.org/erc (exhaustive search, R4–R5) | high |
| 10 | ERC-1404 | erc1404.org | high |
| 11 | Nava ($8.3M, Apr 2026) | fortune.com (2026-04-14) ; docs.navalabs.ai ; autheo.com signals | high |
| 12 | Circle Agent Stack (May 11, 2026) | circle.com/pressroom + blog "introducing-circle-agent-stack" | high |
| 13 | MetaMask Agent Wallet (Jun 8, 2026) | metamask.io/news (agent-wallet launch) | high |
| 14 | Google AP2 | cloud.google.com/blog … announcing-agents-to-payments-ap2-protocol ; ap2-protocol.org | high |
| 15 | Concordium Agent Registry | concordium.com/agent-registry ; concordium.substack.com | high |
| 16 | x402 volume / mechanics | docs.cdp.coinbase.com/x402 ; developers.cloudflare.com/agents/tools/payments/x402 ; stablecoininsider.org | high |
| 17 | KYA / EU AI Act (Aug 2026) | stablecoininsider.org/know-your-agent-kya-in-2026 ; centurian.ai/blog/eu-ai-act-compliance-2026 | high |
| 18 | World ID coverage (18M+, 1000+ Orbs) | techcrunch (2026-04-17) ; world.org blog | high |
| 19 | VAR whitespace synthesis | synthesis of all rounds | ⚠️ unverified (analytical) |

_Round provenance: R1 (initial map) → R2 (bounty/x402 corrections) → R3 (ETHGlobal $15K confirmed) → R4 (ERC-8226 non-existence proven) → R5 (MetaMask added, whitespace re-confirmed at-event)._
