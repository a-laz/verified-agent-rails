# 36-Hour Build Plan

_Verified Agent Rails (VAR): the execution plan — contracts first, then the agent loop, then the thin delegation UI. Realistic about hackathon entropy at 3am._

---

## 0. Orientation

VAR proves one thing on stage: a verified human grants an **Agent Passport** (a scoped **Mandate**: spend cap, asset whitelist, expiry, revocable at will), the agent transacts in compliant USDC on Arc, and a one-click **revoke** kills it by the next block. The whole compliance decision is a single on-chain **VIEW call** on the hot path — no paymaster, no relayer, no off-chain attestation when a transfer fires.

The composition chain we must stand up end to end:

```
token transfer
  → ERC-7943 canTransfer(from, to, amount)      [Final]
    → ERC-8226 isActiveForAmount(agentId, principal, amount)   [Draft]
      → AgentBook (registry/mirror, seeded from World ID proof-of-human)
```

A failed check reverts with a **machine-readable revert reason** (ERC-1404-style restriction code + human string, surfaced through the 7943/8226 revert path).

> **The build mantra:** the contracts ARE the demo. If `canTransfer` reverts correctly before/after a grant and after a revoke, the project is alive. Everything else (agent loop, UI, yield) is presentation around that one VIEW call.

---

## 1. Critical Path

This is the dependency spine. Do these in order; nothing downstream demos without them. Each item is a hard blocker for the next.

| # | Deliverable | Why it's on the critical path | Blocks |
|---|-------------|-------------------------------|--------|
| 1 | **AgentBook + Passport attestation contract** | The registry that resolves eligibility. Holds the Mandate (cap/whitelist/expiry) and the agent→principal link. `grantMandate` / `revokeMandate` write here. | Everything |
| 2 | **Eligibility view (`isActiveForAmount`)** | The ERC-8226 resolver. Reads AgentBook, returns true/false for (agentId, principal, amount). This is the brain of the hot path. | Gated token, agent loop |
| 3 | **Gated demo token (`canTransfer`)** | ERC-7943 pre-transfer hook on a demo ERC-20. `canTransfer` calls into (2); on fail, produce the restriction code + string. Wire revert into `transfer`/`transferFrom`. | Agent loop demo |
| 4 | **Agent loop** (check-eligibility → pay → park-yield) | The autonomous actor. Uses a Dynamic-provisioned wallet to sign, calls the gated token, sweeps idle USDC to a yield instrument the Mandate permits. | UI status, demo arc |
| 5 | **Thin delegation UI** (grant / revoke + live status) | The human's surface. World ID verify → grant Mandate → watch agent → **revoke**. The "kill shot" lives here. | Demo polish |

**Sequencing rule:** do not start the agent loop against a real chain until (3) reverts correctly on a manual `cast send` / script. Prove the revert path with a throwaway script before involving the agent — debugging "why did my agent's tx fail" through three layers + MPC signing at 3am is the worst place to discover a contract bug.

**World ID seam:** AgentBook is "seeded from World ID." For the MVP, the seam is: a World ID proof (Orb credential, `groupId=1`) binds the human, and that verified human's grant writes the agent→principal mandate into AgentBook. The on-chain `verifyProof(...)` ceremony (see §6) is **CUT to STRETCH** if time-constrained — the fallback is to gate `grantMandate` behind a verified World ID proof checked server-side (IDKit `handleVerify` → backend), then write to AgentBook. Either way the demo narrative ("verified once with World ID") holds. Flag which path you shipped.

---

## 2. MVP / CUT / STRETCH

The discipline: **MVP is the demo arc and nothing else.** When you fall behind (you will), cut from the bottom up.

| Capability | MVP (must ship) | CUT first (degrade gracefully) | STRETCH (only if ahead) |
|------------|-----------------|-------------------------------|-------------------------|
| **AgentBook + Passport** | Mandate with spend cap + expiry + agent→principal link; `grantMandate`/`revokeMandate` | Asset whitelist as a single hardcoded token (skip multi-asset list) | Multi-asset whitelist; operator delegation (`setOperator`) |
| **Eligibility view** | `isActiveForAmount(agentId, principal, amount)` checks active + cap + expiry | Cumulative usage tracking via `recordExecution` (use per-tx cap only) | Full cumulative caps + `recordExecution` on every transfer |
| **Gated token** | One demo ERC-20 with `canTransfer` → revert w/ restriction code + string | ERC-721/1155 variants — **ERC-20 only** | ERC-1404 `detectTransferRestriction`/`messageForTransferRestriction` surfaced cleanly in UI |
| **Agent loop** | check → pay (single USDC-denominated purchase) → status | Retry/backoff sophistication; multi-step shopping | Agent reasons over price per x402 call |
| **Yield instrument** | **Most cuttable.** ERC-4626 **stub** vault (`deposit` that just holds funds) so "park idle funds" demos | Real yield math / APY — a stub that holds USDC is fine | Real ERC-4626 vault the Mandate whitelists; visible balance accrual |
| **Settlement** | Plain USDC `transfer` on Arc testnet | x402 / nanopayments integration | x402 HTTP-402 flow: agent pays per API call |
| **Delegation UI** | Grant button, Revoke button, live agent status | Pretty design — function over form | Real-time tx feed, restriction-code decoder panel |
| **Proof of human** | Server-side World ID verify gating the grant | On-chain `verifyProof` in AgentBook | On-chain `verifyProof` ceremony anchoring AgentBook |
| **Verifiable execution** | — | — | **TEE: run the agent in Phala Cloud, surface attestation as a UI badge** (see §6) |

**Golden rule for the yield instrument:** it is the single most cuttable thing in the build. An ERC-4626 stub whose `deposit` just parks USDC and whose `balanceOf` echoes the deposit is enough to say "idle funds swept to a yield instrument the Mandate permits." Do not spend an hour on APY math you'll never demo. ⚠️ verify: ERC-4626 interface details against OpenZeppelin before wiring — not in research bundle.

---

## 3. Workstream Breakdown (2–3 people, parallel)

Three lanes. They converge at the **integration seam** (the agent loop calling the gated token). Lanes A and B can run fully parallel for the first ~12h if they agree on the interface signatures up front (do this in hour 0).

### Lane A — Contracts (Solidity, new code)
Owns the critical-path spine (1→2→3) + the ERC-4626 stub.

- AgentBook + Passport attestation contract: `grantMandate`, `revokeMandate`, agent→principal mapping, Mandate struct (cap, expiry, whitelisted token).
- `isActiveForAmount(uint256 agentId, address principal, uint256 amount) view returns (bool)` — ERC-8226 resolver reading AgentBook.
- Demo gated ERC-20 with `canTransfer(address from, address to, uint256 amount) view returns (bool)` per ERC-7943; wire into `transfer`/`transferFrom`; revert with restriction code + human string.
- ERC-4626 yield stub.
- Deploy to **Arc testnet** (Chain ID `5042002`, RPC `https://rpc.testnet.arc.network`, faucet `https://faucet.circle.com`, explorer `https://testnet.arcscan.app`). Hardhat/Foundry both fine — Arc is fully EVM-compatible.
- **Deliverable for other lanes:** deployed addresses + ABIs + a `cast`/script proving revert-on-fail and clear-on-grant. Publish these the moment they exist.

### Lane B — Agent + Integrations (backend, reuses template)
Owns the agent loop and the wallet/chain plumbing. **Hosts on the existing FastAPI backend.**

- New agent under `backend/src/agents/` following the factory pattern: `create_var_agent(storage) → Agent`, registered in `AGENT_FACTORIES` (`backend/src/agents/__init__.py`). Tools: `check_eligibility`, `pay`, `park_yield` — each `(agent, **kwargs) -> str`, boxing structured status for the dashboard (`agent.box("var/status", ...)`, `agent.box("var/mandate", ...)`, `agent.box("var/tx_feed", ...)`).
- **Dynamic agent wallet** via the Node SDK `@dynamic-labs-wallet/node-evm` (`createDelegatedEvmWalletClient`, `delegatedSignTransaction`). ⚠️ verify: **no Python SDK for Dynamic agent wallets** (research confidence: medium, marked unverified). The Python agent must shell out to a tiny Node signer or wrap the Node SDK behind an HTTP endpoint. Budget time for this seam — it's the sneakiest integration in the build.
  - Add Arc as a custom EVM network via `evmNetworks` (chainId `5042002`, RPC, native currency USDC). ⚠️ verify: exact delegation webhook payload shape is undocumented (research confidence: low). TBD — confirm in Dynamic docs.
- A new router file `backend/src/routers/var.py` for grant/revoke/agent-control endpoints (router isolation — do **not** touch `main.py` except to `include_router`).
- Settlement: plain USDC `transfer` (ERC-20 interface, **6 decimals**) on Arc for MVP. The dual-decimal trap is real — use the ERC-20 6-decimal interface for all balance reads/transfers; do not touch the 18-decimal native interface. USDC contract `0x3600000000000000000000000000000000000000`.

### Lane C — UI (frontend, reuses template)
Owns the thin delegation panel + live status. **Hosts on the existing Next.js 14 frontend.**

- New widgets under `frontend/src/agents/` (mirror `ExampleApp/components/widgets/`): a **GrantRevokePanel** and an **AgentStatusWidget**/**MandateWidget**.
- Widgets read box data via `useBox<T>("var/status")` etc. (2s polling from `GET /api/box/Orchestrator` — the box endpoint merges keys across agent types). Widgets never call chain/APIs directly.
- Grant/Revoke buttons POST to the new `var` router.
- **World ID** front end: IDKit `<IDKitWidget app_id action signal handleVerify>` — `signal` = the human's/agent wallet address, `handleVerify` forwards the proof to the backend for verification before the grant is written. groupId must be 1 (Orb). ⚠️ World ID does NOT authenticate the user to your app — it only proves uniqueness; pair with a wallet signature for session mapping.
- Use design tokens only (`@agent-stack/ui` `var(--*)`), no Tailwind, no hardcoded hex.

**Why the template saves us:** the box-polling dashboard, SSE chat, agent factory, and router isolation are already wired. Lane B drops in one agent + one router; Lane C drops in two widgets + one panel. No infra to build — the "thin delegation UI" and "agent loop" are exactly what this substrate is for.

---

## 4. Hour-Blocked Timeline

Assume a 2–3 person team, a 36h clock, and that **hours 24–30 are the 3am death valley** — plan the hard thinking before then.

### `0–6h` — Foundation & interface lock
- **All hands:** agree on contract signatures (the §3 interfaces) and box keys. Write them down. This 30-min huddle prevents the worst integration pain later.
- Lane A: AgentBook + Mandate struct + `grantMandate`/`revokeMandate` compiling; deploy to Arc testnet; get faucet USDC.
- Lane B: stand up the new agent skeleton + `var` router; get the Node↔Dynamic signing seam doing a single signed tx on Arc (highest-risk integration — de-risk now).
- Lane C: scaffold GrantRevokePanel + status widget reading dummy box data; IDKit modal opening.
- **Milestone M1:** AgentBook deployed; a hardcoded grant is readable on-chain; agent can sign+send one USDC transfer.

### `6–18h` — The spine clears
- Lane A: `isActiveForAmount` reads AgentBook (active + cap + expiry); gated ERC-20 `canTransfer` calls it and **reverts with restriction code + string**; prove via script that a transfer fails pre-grant and clears post-grant.
- Lane B: agent loop calls the gated token — handles the revert, surfaces the machine-readable reason, then on success sweeps to the ERC-4626 stub. Box status at each step.
- Lane C: wire grant/revoke buttons to the router → on-chain writes; live status reflects real box data.
- **Milestone M2 (the keystone):** end-to-end on testnet — **revoke → next block the agent's transfer reverts.** If M2 lands, you have a demo. Protect this milestone above all else.

### `18–30h` — Integration, the demo arc, and the death valley
- Connect all three lanes against real deployed addresses. Walk the **full demo arc** manually once: agent tries to buy → rejected (no passport) → human World ID verifies + grants → agent retries, clears, pays → sweeps to yield → human revokes → agent locked out.
- Fix the integration bugs that only appear when lanes meet (decimal mismatches, stale principal after wallet update, revert-reason decoding in the UI).
- **By hour 28, freeze scope.** Anything not working is CUT, not fixed. Pull from the §2 table bottom-up: yield math → x402 → multi-asset → on-chain verifyProof.
- **Milestone M3 (demo-ready gate):** the full arc runs start-to-finish without a human touching a terminal. Recorded once as a backup video. **This is the gate — if M3 isn't green by hour 30, you cut features until it is.**

### `30–36h` — Harden, rehearse, present
- Seed a clean demo account/wallet with funds; pre-fund the agent; reset any nullifier/used-state so the live demo is repeatable.
- Rehearse the pitch against the four engineer-audience framings; rehearse the live demo twice.
- Slides + the one-VIEW-call diagram + "zero new trust assumptions / revoke → next block the agent is dead."
- ONLY if genuinely ahead and M3 is rock-solid: a STRETCH item (TEE badge, on-chain verifyProof, or x402). Do not start a stretch goal after hour 33.
- **Buffer:** keep the last 90 minutes empty. Something will break. The backup video covers you if the live testnet hiccups.

---

## 5. Definition of Done (Demo)

The demo is done when, **live on Arc testnet, without touching a terminal**, the team can show:

1. **Rejection first.** Agent attempts to buy via the gated token with no passport → transfer **reverts** with a visible machine-readable reason (restriction code + human string).
2. **Verify + delegate.** Human verifies with World ID (once) and grants a Mandate (cap + expiry + whitelisted token) from the UI. The grant is an on-chain write to AgentBook.
3. **Clear + pay.** Agent retries → `canTransfer` → `isActiveForAmount` → AgentBook all pass → USDC payment settles on Arc.
4. **Park yield.** Agent sweeps idle USDC into the (stub) ERC-4626 instrument the Mandate permits; UI shows the parked balance.
5. **The kill shot.** Human clicks **Revoke**. On the agent's **next** attempt (next block), the transfer reverts. Agent is locked out. One click, instant accountability.
6. **The hot-path claim is true and demonstrable:** the per-transfer check is one on-chain VIEW call — no paymaster, no relayer, no off-chain attestation in the loop. Be ready to point at the call.

**Supporting DoD:**
- Restriction code + human string is real, not a hardcoded UI string — it comes through the 7943/8226 revert path.
- A backup recording of the full arc exists (testnet flakes happen).
- README/notes list deployed addresses, the World ID seam actually shipped (on-chain vs server-side — say which), and any CUT items, so judges aren't surprised.
- Pitch lands in one sentence per audience (protocol / agent-infra / payments / standards). The standards angle — first reference implementation composing 7943 (Final) + 8226 (Draft) + 8004 (Draft) against a real proof-of-human — is the differentiator; have it ready.

**Explicitly NOT required for done:** real yield APY, multi-asset whitelist, x402, cumulative `recordExecution` caps, on-chain `verifyProof`, TEE. All STRETCH. Shipping the five-beat arc beats a half-working stretch goal every time.

---

## 6. Stretch: TEE Verifiable Execution

Only if M3 is rock-solid and it's before hour 33. The goal: a signed proof that the *specific* agent code ran unmodified, surfaced as a UI badge.

- **Fastest path is Phala Cloud:** deploy the agent's Docker container via `dstack`; remote attestation is generated automatically (pre-built ERC-8004 agent template exists; new users get free credits). ~5-min deploy claim per research (high confidence). Avoid AWS Nitro Enclaves — it's 2–4 weeks of setup, wrong for a hackathon.
- Surface the attestation quote as a "verified execution" badge in the dashboard (fetch via `dstack describe ... --json` → `attestation_report_url`).
- **Caveat to state honestly:** remote attestation proves *correct code ran*, not *correct results*. Don't overclaim on stage.
- ⚠️ verify: all Phala/dstack specifics against current docs before committing the hour — TEE tooling moves fast and this is off the critical path.

---

## Appendix — Key Interface Anchors (from research bundle)

| Layer | Signature | Status / source |
|-------|-----------|-----------------|
| ERC-7943 (ERC-20) | `canTransfer(address from, address to, uint256 amount) view returns (bool)` | Final |
| ERC-8226 | `isActiveForAmount(uint256 agentId, address principal, uint256 amount) view returns (bool)` | Draft |
| ERC-8226 lifecycle | `grantMandate(...)`, `revokeMandate(...)`, `recordExecution(...)` | Draft — exact params ⚠️ TBD, confirm in EIP |
| World ID | `verifyProof(uint256 root, uint256 groupId, uint256 signalHash, uint256 nullifierHash, uint256 externalNullifierHash, uint256[8] proof) view` | groupId=1 for Orb; caller must track nullifierHash to prevent replay |
| Dynamic | `delegatedSignTransaction(client, {walletId, walletApiKey, keyShare, transaction}) → Promise<string>` | Node SDK only ⚠️ (no Python SDK — confirm) |
| Arc USDC | `0x3600000000000000000000000000000000000000` — use ERC-20 (6-dec) interface | Arc testnet Chain ID `5042002` |
| Yield | ERC-4626 `deposit` / `balanceOf` stub | ⚠️ verify interface vs OpenZeppelin |

_Composition, one line for the protocol engineer: it's a pre-transfer hook — the token calls `canTransfer` per 7943, that calls `isActiveForAmount` per 8226, and 8226 resolves against an AgentBook mirror seeded from World ID. Three view functions, one revert path, zero new trust assumptions._
