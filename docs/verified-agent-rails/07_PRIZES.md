# Prize Strategy

*One build, three tracks: how Verified Agent Rails (VAR) maps cleanly onto the World, Dynamic, and Arc/Circle bounties — plus the EIP reference-implementation angle that makes us hard to beat.*

## The Thesis in One Line

Autonomous agents can't participate in compliant finance because nothing links them to an accountable human. VAR fixes that end to end: a human verifies once with World ID, hands their agent a scoped **Mandate** carried by an on-chain **Agent Passport**, and the money itself refuses to move unless the caller is a verified agent under an unrevoked mandate. Revoke, and **next block the agent is dead**.

That single build touches three sponsor tracks. We don't fork the demo per judge — we tell one story and point at the slice each sponsor cares about.

> ⚠️ **Two reframes from deep research (see `09_RECONCILIATION.md`) — apply before judging:**
> - **Differentiation:** World's own **AgentKit now owns "link an agent to a verified human."** VAR's edge is **compliance enforced at the asset layer in one VIEW call + instant on-chain revocation** — the enforcement and the kill-switch, not the linking. Lead with that.
> - **Standards:** **ERC-8226 is not a verifiable published EIP.** Frame VAR's `EligibilityResolver` as a reference implementation we author; don't cite "8226 Draft" to a standards judge who can check the repo.

## Track Coverage at a Glance

| Track | Prize | Our hook | The artifact we show |
|-------|-------|----------|----------------------|
| **World** | $15K — proof-of-human for the age of AI | The whole rail is anchored to a real human. **AgentBook** is seeded from a World ID proof-of-human; eligibility resolves back to a verified person, not a key. | Live grant flow: human verifies with World ID via IDKit, AgentBook entry appears, agent's first blocked transfer now clears. Then the revoke kill-shot. |
| **Dynamic** | Agent-wallet bounty ("Best Agentic Build", $2k) | The agent runs on a **Dynamic-provisioned wallet** signing autonomously via delegated MPC. It checks eligibility, pays, and parks idle funds in yield — real onchain action, not mocked. | The agent loop running live in the dashboard: check-eligibility → pay → park-yield, with each Dynamic-signed tx landing on Arc. |
| **Arc / Circle** | Stablecoin + payments bounties | Settlement is **USDC on Arc**. We make the USDC itself refuse to move unless the caller passes the passport check — compliance at the token layer, enforced on the **hot path** as a single view call. Idle balance sweeps to a permitted yield instrument. | Agent pays for a service in USDC on Arc; explorer shows the settled transfer + the gated revert on the blocked attempt; idle funds swept to yield. |

## Track 1 — World ($15K, proof-of-human for the age of AI)

**What they're looking for.** "Proof of human for the age of AI" — a unique, privacy-preserving human standing behind an AI action, with no PII exposed. World's own **AgentKit** (launched March 2026) exists to register AI agent wallets to verified humans on-chain via **AgentBook**, so platforms can reason about *which human* is behind an agent. *(per research; high confidence)*

**What we built that satisfies it.** VAR's entire eligibility chain bottoms out at proof-of-human. The composition is:

```
token  ->  7943 canTransfer  ->  8226 isActiveForAmount  ->  AgentBook (seeded from World ID)
```

AgentBook is the on-chain registry/mirror that resolves eligibility, and it is **seeded/anchored by World ID proof-of-human**. No verified human → no AgentBook entry → no passport → the transfer reverts. This is the opposite of "all or nothing": the human verifies once, privacy-preserving, then scopes exactly what the agent may do.

- World ID enrollment is a one-time, privacy-preserving biometric proof of a unique human; only a nullifier (and optional signal) is exposed, never PII. *(per research; high confidence)*
- On-chain verification path is `IWorldID.verifyProof(root, groupId, signalHash, nullifierHash, externalNullifierHash, proof[8])`, `groupId = 1` for Orb credentials, signal binding the proof to the agent wallet. *(per research; high confidence)*
- ⚠️ verify: exact AgentBook contract interface and the registration call our backend issues (CAIP-122 sign + AgentBook lookup pattern is described at *medium* confidence). Treat AgentBook method names as **TBD — confirm in docs** before wiring.

**Judge pitch (one sentence).** *"Your agent gets a wallet from Dynamic, a humanity proof from World, and a scoped mandate onchain — the mandate is enforced by the asset, not by your code, and when the human revokes, the next block the agent is dead."*

## Track 2 — Dynamic (agent-wallet bounty)

**What they're looking for.** "Give your AI agent a wallet, or delegate from your own, and let it loose. Show us autonomous onchain action." Judges reward an agent making real onchain decisions with actual (non-mocked) transactions and a sound delegation/security model. *(per research; high confidence on the track line, medium on exact judging weights)*

**What we built that satisfies it.** The agent runs on a Dynamic agent wallet and signs autonomously through delegated MPC — the private key is never reconstructed.

- Provisioning: user approves delegation → Dynamic sends credentials (`walletId`, `walletApiKey`, `ServerKeyShare`) via webhook → our backend signs server-side. *(per research; high confidence)*
- Signing: `delegatedSignTransaction(client, { walletId, walletApiKey, keyShare, transaction })` returns a signed tx hex ready to broadcast on Arc. *(per research; high confidence)*
- Arc is added as a custom EVM network via Dynamic's `evmNetworks` config (Arc testnet chainId `5042002`). *(per research; high confidence)*

This is the **agent loop** in our substrate: a backend agent (reusing the orchestrator pattern) runs check-eligibility → pay → park-yield, with the thin delegation UI showing grant/revoke live.

- ⚠️ verify: the Dynamic SDK is **Node/TypeScript-first; no Python SDK for agent wallets is documented** *(research: medium/unverified)*. Our backend is FastAPI/Python — the signing step must call the Dynamic Node SDK (sidecar/child process or thin HTTP wrapper). Plan this seam early. **TBD — confirm in docs.**
- ⚠️ verify: TSS-MPC is in **closed alpha** — request environment access *(per research; high confidence)*. Standard embedded/server wallets are the production-ready fallback. Expect ~5–10s per MPC signature; don't design the demo around sub-second signing.

**Judge pitch (one sentence).** *(same sentence as above — World and Dynamic share the "wallet from Dynamic, humanity proof from World, scoped mandate onchain" line; lead with the wallet/MPC half for this judge.)*

## Track 3 — Arc / Circle (stablecoin + payments)

**What they're looking for.** Real agentic commerce on Arc — agents paying for compute/API/data in USDC, with strong technical execution, product utility, and integration quality. Prior Arc tracks explicitly favored realistic agent-to-agent commerce flows over proof-of-concept payments. *(per research; high on track framing, medium on exact judging criteria)*

**What we built that satisfies it.** Settlement is USDC on Arc, and the compliance check lives **in the token itself** on the hot path:

- The per-transfer check is a **single on-chain VIEW call** — `canTransfer` (ERC-7943) → `isActiveForAmount` (ERC-8226) → AgentBook. **No paymaster, no relayer, no off-chain attestation in the hot path.**
- The agent autonomously pays for a service (API call, data feed) settling in USDC on Arc; idle balance is swept to a yield instrument the mandate permits.
- Blocked transfers return a **machine-readable revert reason** — an ERC-1404-style restriction code plus human string (`detectTransferRestriction` / `messageForTransferRestriction` style), surfaced through the 7943/8226 revert path — so the agent can reason about *why* it was rejected, not just *that* it was.

Arc facts to lean on in the pitch:

| Fact | Detail | Confidence |
|------|--------|-----------|
| USDC is the native gas token on Arc | ~$0.01 per tx, fee-smoothed | high |
| Dual-decimal USDC | one token, two interfaces: 18-decimal native (gas) + 6-decimal ERC-20 (transfers) — **use the ERC-20 6-decimal interface for balances/transfers** to avoid double-counting | high |
| USDC contract on Arc testnet | `0x3600000000000000000000000000000000000000` | high |
| Arc testnet | Chain ID `5042002`, RPC `https://rpc.testnet.arc.network`, faucet `https://faucet.circle.com`, explorer `https://testnet.arcscan.app` | high |
| Native nanopayments | gasless batched USDC settlement, min $0.000001, EIP-3009 authorizations | high |

- ⚠️ verify: Arc **mainnet is not yet live** (expected summer 2026); we ship on **testnet**, and mainnet RPC/addresses/fee mechanics may change. Demo on testnet only.
- ⚠️ verify: nanopayments/x402 require funding a Circle Gateway balance for instant settlement; the sub-cent path is batched, not real-time on-chain. If the demo needs an explorer-visible settled tx, use a normal on-chain USDC transfer (~$0.01 gas), not the batched nanopayment path.

**Judge pitch (one sentence).** *"Arc has dual-decimal USDC and native nanopayments — we make the USDC itself refuse to move unless the caller is a verified agent under an unrevoked mandate; the check is a view call, no paymaster, no relayer, no off-chain attestation in the hot path."*

## The Differentiator: EIP Reference Implementation

This is the line that separates us from a pile of payment demos. We compose three live standards against a real proof-of-human — and **nobody has done all three together.**

| Standard | Role in VAR | Status |
|----------|-------------|--------|
| **ERC-7943** | Token-level pre-transfer hook. The token calls `canTransfer(...)`. | **Final** |
| **ERC-8226** | Eligibility resolver. Our `canTransfer` implementation calls `isActiveForAmount(...)`. | **Draft** |
| **ERC-8004** | Agent identity layer. | **Draft** |

```
token  ->  7943 canTransfer  ->  8226 isActiveForAmount  ->  AgentBook (seeded from World ID)
```

Three view functions, one revert path, **zero new trust assumptions**. ERC-7943 is Final and ERC-8004 is Draft; **VAR authors the mandate-resolver layer itself** and composes all three against a real proof-of-human — nobody has shipped that. **We're the reference implementation.** ⚠️ Deep research could not verify ERC-8226 as a published EIP — say "the resolver layer we wrote," not "8226 Draft," to a judge who might check. See `09_RECONCILIATION.md`.

- Key signatures we implement (from research):
  - ERC-7943 (ERC-20): `function canTransfer(address from, address to, uint256 amount) external view returns (bool allowed)`
  - ERC-8226: `function isActiveForAmount(uint256 agentId, address principal, uint256 amount) public view returns (bool)`
- ⚠️ verify: 8226 and 8004 are **Draft** — interfaces may shift before standardization; 8004 only reached mainnet Jan 2026 (early-adoption risk). Pin to the spec revision we build against.
- ⚠️ verify: ERC-8226 distinguishes *mandate validity* from *eligibility* — having an agent in the 8004 Identity Registry does **not** by itself grant eligibility; eligibility is delegated to a compliance provider. Our AgentBook (World ID-seeded) plays that resolver role. Confirm the exact `IComplianceProvider` seam. **TBD — confirm in docs.**

## Judging-Day Talking Points

1. **One build, three tracks.** "We didn't build three demos. We built one rail and it satisfies World, Dynamic, and Arc/Circle simultaneously."
2. **Lead with the kill-shot.** Run the demo arc to the revoke: agent is transacting, human taps revoke on their phone, **next block the agent is dead.** Accountability with one click.
3. **Hot path is a view call.** No paymaster, no relayer, no off-chain attestation in the hot path — just `canTransfer → isActiveForAmount → AgentBook`. Repeat this; it's the technical credibility line.
4. **Zero new trust assumptions.** We compose existing, real standards plus real World ID proof-of-human. We didn't invent a trust oracle.
5. **The leash framing for non-engineers.** "It's expense-card controls, but for AI agents — except it works for any asset and the rules are enforced by the money itself, not a bank's back office."
6. **Reference-implementation angle for standards/EIP judges.** "7943 Final, 8226 Draft, 8004 Draft — nobody has composed all three against a real proof-of-human. We're the reference implementation; if 8226 moves to Review, we want to be the deployment they cite."
7. **Machine-readable rejections.** When a transfer is blocked the agent gets a structured restriction code + human string, so it can reason about the failure instead of retrying blindly.
8. **Stretch, if asked.** Put the agent in a TEE (Phala Cloud is the ~5-minute path) so its execution is verifiable — frame as roadmap, not as a thing we're claiming to have shipped unless we actually did.

## Demo Arc (the through-line judges watch)

1. Agent tries to buy a service → **rejected**, no passport (machine-readable revert reason shown).
2. Human verifies with World ID → delegates a scoped Mandate (spend cap, asset whitelist, expiry) → Agent Passport minted, AgentBook entry appears.
3. Agent retries → **clears compliance** → pays in USDC on Arc → sweeps idle funds to the permitted yield instrument.
4. **Kill-shot:** human revokes → next block, the agent is locked out.

Each step lights up a different sponsor's track without changing a line of the build.
