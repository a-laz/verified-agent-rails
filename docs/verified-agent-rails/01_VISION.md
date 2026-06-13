# Vision & Pitch

_Verified Agent Rails (VAR): give an AI agent a leash, not your whole wallet — enforced by the money itself._

This is the canonical messaging reference for the team. Use the exact terms and quotes below. Keep it consistent.

---

## 1. The Problem

Autonomous agents can't participate in compliant finance because nothing links them to an accountable human.

Today, handing an AI agent money is **all-or-nothing**:

- You give the agent a wallet (or your wallet's keys) and hope it behaves.
- There's no native way to give an AI a **limited** version of your wallet — spend up to this much, for this purpose, until I say stop.
- If the agent pays the wrong bill, gets prompt-injected, or simply doesn't stop, there's no instant, enforced way to pull it back.
- Compliant / KYC-gated assets won't touch an agent at all, because **no accountable human** is provably behind it.

Corporate expense cards solved the human version of this decades ago: limits, categories, instant freeze. AI agents moving money have none of it.

## 2. The Thesis

> **Autonomous agents can't participate in compliant finance because nothing links them to an accountable human. This fixes that, end to end.**

The fix is an **Agent Passport** — an on-chain, signed attestation that an agent acts for a verified human — carrying a scoped **Mandate** (spend cap, asset whitelist, expiry, revocable at will). The asset itself checks the passport on every transfer. No accountable human, no movement.

## 3. How It Works — 4 Plain Steps

| # | Step | What happens |
|---|------|--------------|
| 1 | **Credential the human** | A user verifies once with World ID — proof of a unique human, privacy-preserving (no PII exposed). |
| 2 | **Delegate to the agent** | The user provisions an agent wallet (via Dynamic) and attaches a signed, on-chain **Agent Passport**: _"this agent acts on behalf of this verified human, within these limits"_ — the **Mandate** (spend caps, asset whitelist, expiry). |
| 3 | **Gate the assets** | A compliant token exposes one view function. Every transfer checks whether the sender carries a valid Agent Passport under an unrevoked Mandate. Eligible transfers clear; others revert with a **machine-readable revert reason**. |
| 4 | **Let it transact** | The agent autonomously pays for a service (API call, data feed), settling in stablecoins (USDC) on Arc, with idle balance swept to a yield instrument its Mandate permits. |

**The composition (hot path):** `token → ERC-7943 canTransfer → ERC-8226 isActiveForAmount → AgentBook (seeded from World ID)`. The per-transfer check is a single on-chain **VIEW call** — no paymaster, no relayer, no off-chain attestation in the hot path.

**The kill shot:** the human revokes the Mandate, and the next block the agent is dead. Accountability with one click. **Zero new trust assumptions.**

## 4. Pitch Library

### Plain-language pitch — expense-card framing (verbatim)

> "It's expense-card controls, but for AI agents. Corporate cards already do this — limits, categories, instant freeze. We built the same thing for AI agents moving money, except it works for any asset and the rules are enforced by the money itself, not by a bank's back office."

### Plain-language pitch — leash framing (verbatim)

> "Imagine you hire an AI assistant to pay your bills. You give it your card. Great — until it pays the wrong bill, or someone tricks it, or it just doesn't stop. Today there's no way to give an AI a limited version of your wallet. It's all or nothing. We fixed that. The human verifies they're a real person, once. Then they hand the AI a leash: you can spend up to this much, for this purpose, until I say stop. The money itself enforces the leash. If the AI tries to go past the line, the transaction just... doesn't happen. And the human can yank the leash from their phone, instantly."

### Four sentences that land with engineers (verbatim — pick by audience)

| Audience | The line |
|----------|----------|
| **Protocol engineer** | "It's a pre-transfer hook. The token calls canTransfer per 7943, that implementation calls isActiveForAmount per 8226, and 8226 resolves against an AgentBook mirror seeded from World ID. Three view functions, one revert path, zero new trust assumptions." |
| **Agent / AI infra engineer** | "Your agent gets a wallet from Dynamic, a humanity proof from World, and a scoped mandate onchain. The mandate is enforced by the asset, not by your code. When the human revokes, the next block the agent is dead — you didn't have to ship a kill switch." |
| **Stablecoin / payments engineer** | "Arc has dual-decimal USDC and native nanopayments. We make the USDC itself refuse to move unless the caller is a verified agent under an unrevoked mandate. The check is a view call. No paymaster, no relayer, no off-chain attestation in the hot path." |
| **Standards / EIP person** | "7943 is Final, 8226 is Draft, 8004 is Draft, and nobody has composed all three against a real proof-of-human. We're the reference implementation. If 8226 moves to Review, we want to be the deployment they cite." |

> ⚠️ **Verify before using the standards pitch (deep research):** ERC-8226 could **not** be found as a published EIP. Unless a teammate holds a private draft, use the safer framing — _"ERC-7943 (Final) is the finished standard; we **author** the mandate-resolver layer and compose it with ERC-8004 identity + World ID proof-of-human"_ — so a judge checking the EIP repo doesn't catch a phantom draft. See `09_RECONCILIATION.md`.

## 5. Why Now

Two waves are converging, and VAR sits exactly at the intersection.

**Proof-of-human for the age of AI.** World ID now ships proof-of-human primitives aimed squarely at AI agents: AgentKit (launched March 2026) registers AI agent wallets to verified humans on-chain via **AgentBook**, enabling platforms to enforce limits **per human, not per agent**, with zero-knowledge proofs and no PII liability.

**Agentic payments went live.** Stablecoin rails are now purpose-built for machine-speed commerce:

- **Arc** — Circle's EVM-compatible L1 for stablecoin finance — uses USDC as the native gas token (~$0.01/tx), with **dual-decimal USDC** (18-decimal native + 6-decimal ERC-20) and **nanopayments** (gasless sub-cent USDC settlement, minimum $0.000001). Testnet live since Oct 2025; mainnet expected summer 2026. ⚠️ verify: mainnet timing.
- **x402** (HTTP 402) lets agents autonomously pay for APIs with no keys or credit cards — request, get a 402, sign a USDC authorization, retry with proof.

**The standards exist but have never been composed.** ERC-7943 (token transfer-gating, **Final**) and ERC-8004 (agent identity, **Draft**) each define a piece; VAR **authors** the mandate-resolver layer (`EligibilityResolver`) itself and composes all three against a real proof-of-human. ⚠️ Deep research could not verify **ERC-8226** as a published EIP — present the resolver as VAR's own reference implementation, not a draft we consume (`09_RECONCILIATION.md`). VAR is the reference implementation of the composition.

The wallets (Dynamic), the humanity proof (World ID / AgentBook), the settlement rail (USDC on Arc), and the compliance standards all shipped within roughly a year of each other. The missing piece is the thing that ties an agent to an accountable human and lets the **asset itself** enforce the leash. That's VAR.

---

_Next: see `02_*` for architecture and the contract composition. Box data shapes live in `contracts/box_schemas.md`._
