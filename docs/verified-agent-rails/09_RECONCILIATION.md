# Post-Research Reconciliation

_What the overnight 14-expert deep-research loop changed in the v1 design docs (`01`–`08`). This doc + `research/DECISIONS.md` are now the authoritative decision source where they differ from `01`–`08`._

> **Verdict: BUILD — GO**, contingent on one hour-0 topology gate. Every foundation layer is live or Final. But **two load-bearing corrections** and **five interface/topology pins** must propagate before contracts + UI parallelize. Full evidence in [`research/00_DOSSIER.md`](research/00_DOSSIER.md), [`research/DECISIONS.md`](research/DECISIONS.md), [`research/OPEN_QUESTIONS.md`](research/OPEN_QUESTIONS.md).

---

## 🔴 DECIDE FIRST (existential — you're at ETHGlobal NYC now)

**Does the Circle/Arc bounty accept an Arc-_testnet_ demo, or require Arc-_mainnet_ settlement?** Arc mainnet doesn't launch until summer 2026 — after the event. The entire plan is locked to Arc testnet (`5042002`). If the Arc bounty requires mainnet, pivot to a **World Chain monolith (Chain ID 480)** on day one — different addresses, RPC, USDC interface. **Ask the Circle/Arc and World ID track leads in person before committing a deploy target.** Secondary same-hour spike: World ID State Bridge → Arc testnet is permissionless but *unproven* (no public examples) — run a POC before trusting it.

---

## Two load-bearing corrections (these were wrong in v1)

### ❌→✅ 1. ERC-8226 is not a verifiable public standard
Nine of thirteen research domains searched the EIP repos / ethereum-magicians and **found no published ERC-8226.** v1 docs present it as a real "Draft" — that's a credibility risk if a standards judge checks.

- **Correction:** VAR ships its **own `EligibilityResolver`** contract. We are the *reference implementation*, not a consumer of a spec.
- **Pitch reframe (use this):** ~~"7943 is Final, 8226 is Draft, 8004 is Draft…"~~ → **"ERC-7943 (Final) is the only piece that exists as a finished standard. We author the mandate-resolver layer ourselves and compose it with ERC-8004 agent identity and World ID proof-of-human — nobody has shipped that composition."** Don't claim a draft number you can't show a judge.
- **If a teammate holds a private/unindexed 8226 draft:** confirm the number + `isActiveForAmount` signature hour 0 and we keep the original framing. Otherwise use the reframe above.

### ❌→✅ 2. `getActivePrincipal` does not exist in ERC-8004
ERC-8004's identity registry exposes **`getAgentWallet(agentId) → address`** only. v1 `02_ARCHITECTURE.md` and `03_CONTRACTS.md` reference a fictional `getActivePrincipal` — **it will not compile.** (Fixed inline in both docs.)

- **Correction:** Key the Mandate by **agent-wallet address** (D9). Store `principal` at grant time; on the hot path, resolve `agent → principal` locally and **compare stored-vs-current, revert on mismatch** (catches wallet rotation). Rotation requires re-granting — a documented limitation, acceptable for the hackathon.

---

## Harmonizations applied / required

| # | v1 said | Corrected to | Where |
|---|---------|--------------|-------|
| H1 | Mandate has cumulative `spent`; eligibility checks `m.spent + amount > spendCap`; `recordExecution` on every transfer | **MVP = per-transaction caps only** (`amount > spendCap`). `spent`/`recordExecution` → STRETCH (a state write breaks the "one VIEW call" invariant). | `03_CONTRACTS.md` §2/§5 (annotated), `06_BUILD_PLAN.md` already per-tx |
| H2 | "`canTransfer` reverts" (loose) | `canTransfer` is a **pure VIEW returning `bool` and MUST NOT revert** (ERC-7943). The **revert fires in the token's state-changing hook (`_update`)** when `canTransfer` returns false, via custom error `TransferRestricted(uint8 code, string message)`. | `03` §4 (annotated) |
| H3 | AgentBook "may be the live World AgentBook ABI" | AgentBook appears to be a World **service**, not a canonical on-chain contract. VAR defines its **own Arc-local mirror** with `resolveHuman(address)→address` — a free design choice. Confirm from `@worldcoin/agentkit` source. | `03` §3.3, `04` §1 |
| H4 | Signing bridge "sidecar or subprocess" | **Node.js HTTP sidecar** (Express + Dynamic SDK) exposing `/sign-transaction`, called from FastAPI. Budget 5–10s/MPC signature (off hot path). | `06` Lane B, `04` §2 |
| H5 | Differentiator = "link an agent to an accountable human" | World's own **AgentKit now owns "link agent → human."** VAR's edge is **one-call compliance enforced at the asset layer + instant on-chain revocation** — the *enforcement + kill-switch*, not the linking. Lead with that for judges. | `07_PRIZES.md` (annotated) |

---

## Locked decisions (adopt unless DECIDE-FIRST flips topology)

Summarized from `research/DECISIONS.md` — read that for the driving fact behind each.

| # | Decision | Lock | Conf |
|---|----------|------|------|
| D0 | Chain topology | Arc-testnet monolith — *pending bounty go/no-go* | MED ⚠️ |
| D1 | What hosts what | All 4 contracts + settlement on Arc; World ID seeds AgentBook once off-path | HIGH |
| D2 | Mandate impl | Bespoke on-chain struct + custom `EligibilityResolver` (not 7710/7579) | HIGH |
| D3 | Signature scheme | EIP-712 typed data, recovered on-chain — *gated on Dynamic SDK supporting 712* | MED ⚠️ |
| D4 | Spend caps | Per-transaction only for MVP; cumulative → stretch | HIGH |
| D5 | Payment | Plain USDC transfer for MVP; x402 stretch | HIGH |
| D6 | World ID anchor | Arc-local AgentBook mirror + mandatory `usedNullifiers` replay map | HIGH |
| D7 | Yield | 1:1 stub ERC-4626; whitelist the **share token only**; cuttable P2 | HIGH |
| D8 | TEE | OUT of MVP; Phala dstack attestation badge is a clean stretch | HIGH |
| D9 | Agent keying | Key Mandate by agent-wallet address; rotation = documented limit | MED ⚠️ |
| D10 | Revert codes | GatedToken owns `detectTransferRestriction`; revert in `_update`; codes 0–6 binding | HIGH |
| D11 | Signing bridge | Node HTTP sidecar wrapping Dynamic SDK | HIGH |

---

## Still open — pin at hour 0 before Lane A writes the hot-path body

These genuinely need SDK-source extraction or a sponsor/team answer (an agent shouldn't guess):

1. **Resolver asset-binding** — single canonical signature. Recommended: `isActiveForAmount(uint256 agentId, address principal, uint256 amount)` bound to one hardcoded GatedToken; asset check lives in `GatedToken.canTransfer`. (resolves the Pattern-B-vs-single-token split)
2. **`grantMandate(...)` exact params** — two incompatible lists circulating; converge to one. Blocks Lane A + Lane C.
3. **Dynamic `delegatedSignMessage`: EIP-712 or EIP-191 only?** Read the installed `@dynamic-labs` `.d.ts`. Gates the whole signature scheme (D3).
4. **World AgentBook `resolveHuman` ABI** — extract from `@worldcoin/agentkit` source, or confirm it's a free design choice.
5. **`Mandate.identityRef`** = raw `nullifierHash` vs composite `keccak256(nullifierHash, agentWallet)` — decides demo-repeatability across dry-runs.
6. **Dynamic delegation webhook payload** — full shape beyond `ServerKeyShare`; needed before wiring the sidecar.

`externalNullifierHash` recommended constant: `keccak256(abi.encodePacked('verified-agent-rails-agentbook'))`.

---

_Generated from the overnight research loop: 5 rounds · 90 agents · ~5.7M tokens. Per-domain depth in [`research/`](research/). ⚠️ items remain unverified — recommendations, not settled fact._
