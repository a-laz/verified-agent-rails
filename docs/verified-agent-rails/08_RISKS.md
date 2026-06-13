# Risks & Open Questions

_The honest risk register for Verified Agent Rails (VAR) — read this before you start cutting Solidity._

This is the part of the build that bites teams at hour 30. VAR composes four moving systems — World ID (proof-of-human), Dynamic (agent wallet signing), Arc (token + settlement), and a new three-EIP contract stack (ERC-7943 → ERC-8226 → AgentBook) — and the failure modes cluster at the seams between them, not inside any one piece. The core thesis stays intact: the hot path is a single on-chain VIEW call, with **zero new trust assumptions** and revoke meaning "next block the agent is dead." Everything below is about making sure we actually get there in 36 hours.

---

## Risk Register

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | **Cross-chain mismatch.** World ID's AgentBook + `verifyProof` live on World Chain / Base / OP; the gated token + USDC settlement live on Arc; Dynamic signs across custom EVM nets. The composition chain (token → 7943 `canTransfer` → 8226 `isActiveForAmount` → AgentBook) assumes all hops resolve **on one chain**. If AgentBook is on World Chain and `canTransfer` runs on Arc, the hot-path VIEW call has nothing local to read. | **Critical** — breaks the entire hot path; no single VIEW call possible across chains | High | **Pick ONE chain and host everything there.** Deploy our own AgentBook **mirror** on Arc, seeded/anchored from a World ID proof, and have ERC-8226 resolve against the Arc-local mirror. Treat World ID as the off-chain/one-time seeding event, not a hot-path dependency. The research bundle confirms the composition "assumes all three standards are implemented on the same chain; cross-chain agent-to-token transfers are NOT addressed." This is the **#1 build risk** and the first architectural decision to lock. |
| 2 | **World-ID-to-address binding subtlety.** World ID proves *unique + revocable humanity*, bound to an address via the `signal` param and a one-time-use `nullifier`. It does **not** dox the human, store PII, or "authenticate" them to our app. Misframing this in the demo (or the contract) invites a "so where's the KYC?" question we can't answer, and risks reusing a nullifier incorrectly. | **High** — undermines the pitch credibility and can introduce a replay bug | Medium | Frame consistently: humanity is **"unique + revocable," not "doxxed."** The mandate is what carries scope; the passport just anchors it to *a verified unique human*. On the contract side: `signal = agent wallet address`, and we **must track `nullifierHash` server-side / on-chain** — `verifyProof` does not prevent replay (research: "your contract must check a mapping of seen nullifiers"). Keep `externalNullifierHash` (app context) documented and distinct from `signal`. |
| 3 | **EIP draft instability.** ERC-7943 is **Final**, but **ERC-8226 (mandate) and ERC-8004 (identity) are Draft** — interfaces may change before standardization. We could build against `isActiveForAmount(...)` or an 8004 registry signature that has since shifted. | **High** — a wrong signature means our `canTransfer` impl won't compile against the real interface | Medium | **Verify every Draft signature against the live spec in the first 2 hours, before writing the contract.** Pin the exact `isActiveForAmount(uint256 agentId, address principal, uint256 amount) → bool` from the EIP page. Keep our own thin interface shims so we're decoupled from churn. We are deliberately building the **reference implementation** of this composition — own the interface surface rather than over-coupling to it. ERC-8004 only hit mainnet Jan 2026 → early-adoption risk; do not assume a deployed registry, deploy our own minimal one if needed. |
| 4 | **Arc testnet availability / maturity.** Settlement is USDC on Arc. Arc **mainnet is not live** (expected summer 2026); we ship on **testnet** (Chain ID `5042002`, RPC `https://rpc.testnet.arc.network`, faucet `https://faucet.circle.com`). Testnet is experimental — RPC flakiness, the dual-decimal USDC trap (18-dec native vs 6-dec ERC-20 sharing one balance), and possible breaking changes. | **High** — if Arc RPC is down during the demo, nothing settles | Medium | Confirm testnet RPC + faucet are live **hour 1**; mint test USDC early. **Use the ERC-20 (6-decimal) interface for all balance reads and transfers** to dodge the dual-decimal double-count trap (USDC at `0x3600000000000000000000000000000000000000`). Have a local/forked fallback node ready. Keep gas funded — USDC is the gas token on Arc. |
| 5 | **Yield instrument is the cuttable scope.** "Idle funds swept to a yield instrument the mandate permits" is the 4th flow step. It needs a yield venue *on Arc testnet* that may not exist / may be unaudited, plus mandate logic to whitelist it. | **Medium** — nice-to-have; its absence doesn't break the core accountability story | Medium-High | **Treat yield as the first thing to cut.** Core demo = grant → gated pay → revoke → locked out. The "park idle funds in yield" sweep can be a **mock yield token** (a trivial ERC-20 vault stub the mandate whitelists) to demonstrate the *asset-whitelist* dimension of the mandate without depending on a real Arc yield protocol. Real yield is a stretch, behind the kill-shot demo. |
| 6 | **36-hour time risk.** Four integrations + new Solidity + a thin UI + a demo agent loop. Realistic time sinks: MPC signing latency (Dynamic ~5–10s/sig per research, **not** sub-second), webhook delivery for delegation creds, no Python SDK for Dynamic (Node-only — our FastAPI backend must shell out / HTTP-bridge), and World ID proof gen (~1–5s). | **High** — classic hackathon over-scope; demo not ready at judging | High | Ruthless scope ladder: **(1)** contracts + single gated token + `canTransfer` revert path; **(2)** Dynamic agent wallet + pay loop on Arc; **(3)** thin grant/revoke UI reusing the agent-stack-template substrate (frontend panel + backend agent loop, box-based live status); **(4)** yield sweep (cuttable, #5); **(5)** TEE attestation (stretch, drop freely). Build the **demo arc rejection → grant → pay → revoke** end-to-end on mocks *first*, then swap in real components. Budget for MPC latency in the demo script — don't promise instant signing. |
| 7 | **Dynamic delegation / MPC operational risk.** Delegated signing depends on a webhook delivering `walletId` / `walletApiKey` / `keyShare`; TSS-MPC is in **closed alpha** (request access). Dynamic signs whatever transaction it's handed — it does **not** validate transaction logic. | **Medium** | Medium | Request TSS-MPC / API access **immediately** (lead-time risk). If alpha access doesn't land, fall back to a standard Dynamic embedded/server wallet — the accountability story lives in the *mandate + token gate*, not in the wallet's key model. Add webhook retry; store creds securely server-side. All transfer safety comes from the on-chain gate, never from trusting the signer. |
| 8 | **Machine-readable revert fidelity.** The pitch promises an ERC-1404-style restriction code + human string surfaced through the 7943/8226 revert path. ERC-7943 `canTransfer` returns `bool`; mapping a clean reason code through the revert requires our own `detectTransferRestriction` / `messageForTransferRestriction`-style layer. | **Low-Medium** | Medium | Wrap our gate logic with explicit restriction codes (e.g. `0 = OK`, `1 = no passport`, `2 = mandate expired/over-cap`, `3 = asset not whitelisted`) and a `messageForTransferRestriction(code)` view. Surface the code in both the revert and the UI status. Low risk to build, high demo payoff (the "rejected, here's exactly why" moment). |

---

## Open Questions to Resolve in the First 2 Hours

Pull every unverified/low-confidence research item and architecture unknown into a single hour-0 checklist. **Do not write contract code until the starred (★) chain/interface items are answered.**

### ★ Chain & topology (blockers)
- [ ] **★ Which single chain hosts the live composition?** (See decision below — lock this first.)
- [ ] **★ Can we deploy an AgentBook mirror on Arc seeded from a World ID proof**, or do we anchor differently? World ID's real AgentBook is chain-specific (World Chain / Base) — cross-chain requires bridging or our own mirror. _(research: AgentBook is chain-specific; "no direct proof-of-human mechanism" exists inside the three EIPs — confidence: medium/unverified)_
- [ ] **★ Confirm the exact `isActiveForAmount` signature** against the live ERC-8226 page before coding `canTransfer`. Draft status = may have changed.
- [ ] **★ Confirm ERC-8004 Identity Registry `register` / `getAgentWallet` signatures** and whether we deploy our own minimal registry or rely on a deployed one.

### Arc / settlement
- [ ] Arc testnet RPC (`https://rpc.testnet.arc.network`), Chain ID `5042002`, and faucet (`https://faucet.circle.com`) all live right now? Mint test USDC.
- [ ] Confirm USDC dual-decimal handling — standardize on the **6-decimal ERC-20 interface** everywhere; verify contract at `0x3600000000000000000000000000000000000000`.
- [ ] Is there **any** yield venue on Arc testnet, or do we ship the mock vault stub? (Drives risk #5.)

### Dynamic / agent wallet
- [ ] Is TSS-MPC alpha access granted for our environment? If not, which fallback wallet model? _(research: closed alpha — request access)_
- [ ] Exact **delegation webhook payload shape** and `ServerKeyShare` structure — both marked low-confidence/inferred in research. ⚠️ verify before wiring the signing path.
- [ ] How does our **Python/FastAPI backend** invoke the **Node-only** Dynamic SDK? (subprocess vs HTTP bridge) _(research: no Python SDK documented — confidence: medium)_
- [ ] Budget the real **MPC signing latency** (~5–10s/sig) into the demo timeline.

### World ID
- [ ] Confirm `signal = agent wallet address` binding flow and that we **track `nullifierHash`** to prevent replay (`verifyProof` does not).
- [ ] Confirm `externalNullifierHash` (app-context) value and document it to avoid a security bug.
- [ ] Does AgentKit registration require a prior Orb visit (Orb-only, `groupId = 1`)? Affects demo-day logistics.

### Stretch (verify only if we get there)
- [ ] TEE path (Phala Cloud vs Nitro) — Phala = ~5-min Docker deploy with attestation; Nitro = 2–4 weeks. **Only if core is done.** Remote attestation proves *correct code, not correct results*.

### Claims flagged by research that need confirmation (carry-over)
- "No direct proof-of-human primitive in 7943/8226/8004; registry must be seeded externally" — _confidence: medium._
- Dynamic delegation webhook payload + `ServerKeyShare` fields — _inferred, low confidence._
- No Python SDK for Dynamic agent wallets — _confidence: medium; if false, simplifies the backend bridge._
- Anything written as **"TBD — confirm in docs"** in sibling docs gets resolved here.

---

## The Decision to Lock First: Which Chain Hosts What

Everything above funnels to one call. The hot path must be a **single on-chain VIEW** (`token → 7943 canTransfer → 8226 isActiveForAmount → AgentBook`), and a VIEW call cannot reach across chains. So the eligibility resolver and the token **must be co-located**.

**Recommended decision (default to lock):**

| Layer | Chain | Rationale |
|-------|-------|-----------|
| Gated token + USDC settlement | **Arc (testnet)** | Settlement is USDC on Arc; the token *is* the enforcement point; keep the hot path local. |
| ERC-7943 / 8226 / 8004 stack + **AgentBook mirror** | **Arc (testnet)** | Co-located with the token so `canTransfer` resolves in one local VIEW call. |
| World ID proof-of-human | **off-chain / one-time seed** | Used to **seed/anchor** the Arc AgentBook mirror at grant time — kept out of the hot path entirely. Preserves **"zero new trust assumptions"** and **"revoke → next block the agent is dead."** |
| Dynamic agent wallet signing | configured for **Arc** (`evmNetworks` custom chain) | Signs Arc transactions; no cross-chain hop. |

**One-line rule:** _World ID seeds the mirror once; the mirror lives on Arc next to the token; the per-transfer check never leaves Arc._ Lock this before any Solidity is written — every other risk in the register is downstream of it.
