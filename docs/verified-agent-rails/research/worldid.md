# World ID — Proof-of-Human for Verified Agent Rails

_The humanity anchor: one VIEW call binds an autonomous agent's wallet to one accountable, privacy-preserving, unique human._

## Feasibility verdict

**FEASIBLE — build it.** World ID's on-chain path satisfies every VAR invariant: the hot path is a single stateless `view` (`WorldIDRouter.verifyProof` at seed time; `AgentBook.resolveHuman` on the per-transfer path), no paymaster, no relayer, no off-chain attestation, **zero new trust assumptions** (World ID is the only trusted root we add; eligibility logic is transparent and proprietary). Two early-round blockers are now **resolved**:

- **Cross-chain mismatch (R3 BLOCKER #1) → RESOLVED (R5):** AgentBook is a **hosted service**, not a canonical deployable contract. There is no World contract to inherit or read cross-chain. VAR is therefore **free to define its own Arc-local AgentBook mirror**, seeded once via World ID proof at grant time. This keeps the hot path a single VIEW on Arc and preserves the thesis. (high confidence)
- **`$15K` bounty (open since R1) → CONFIRMED (R5):** World ID is a confirmed `$15K` sponsor track at ETHGlobal NYC 2026 (June 12–14). (high confidence; still verify Arc-testnet eligibility with sponsors)

Residual blockers are **design choices**, not external unknowns: (1) `ERC-8226` does not exist as an EIP — VAR's `isActiveForAmount`/`grantMandate`/`revokeMandate` are proprietary; (2) `AgentBook.resolveHuman` ABI is VAR-designed (free choice, since the mirror is ours); (3) `Mandate.identityRef`/principal-binding semantics must be pinned before contract deploy.

| Invariant | Status | Evidence |
|-----------|--------|----------|
| Hot path = ONE on-chain VIEW call | ✅ met | `verifyProof` (seed) and `resolveHuman` (per-transfer) are both `external view` |
| No paymaster / relayer / off-chain attestation in hot path | ✅ met | On-chain verification needs no sidecar; AgentBook mirror is local |
| Zero new trust assumptions | ✅ met | World ID is the only added root; eligibility is transparent proprietary logic |
| Privacy-preserving proof of UNIQUE human | ✅ met | RP-scoped nullifiers, no PII, unlinkable across apps |
| Revoke → next-block lockout | ✅ met | `mandate.revoked` flips next `isActiveForAmount` to `false` (on-chain state read) |

---

## 1. What World ID gives VAR

A zero-knowledge proof that a **unique** human stands behind the agent. The proof carries a **nullifier** (one-per-person-per-context) and a **signal** (binds the proof to a specific wallet/action). No PII, names, emails, iris code, or biometrics are revealed — only nullifier + signal. This is the "verify once" that seeds AgentBook and anchors the Agent Passport.

Critically (R3, high confidence): **World ID proves UNIQUENESS, not authentication.** The proof says "this human is unique and has not reused this action" — it does NOT prove auth, age, or identity. VAR pairs `World ID proof + Dynamic wallet signature` → "a unique human approved this agent"; the Mandate then enforces scope.

---

## 2. On-chain verification surface (hot path = ONE VIEW call)

### 2.1 `WorldIDRouter.verifyProof` — used at SEED time only

Stateless `external view`. Validates Merkle root / signal / proof. **Does NOT prevent replay** — the calling contract MUST track `nullifierHash`. (high confidence, consistent across all 5 rounds)

```solidity
// World ID Router — called ONCE at AgentBook seeding, NEVER on the per-transfer hot path
function verifyProof(
    uint256 root,
    uint256 groupId,            // MUST be 1 (Orb credentials only)
    uint256 signalHash,         // keccak256(abi.encodePacked(signal)).hashToField(); signal = agent wallet
    uint256 nullifierHash,      // track on-chain to prevent replay (one human → one anchor)
    uint256 externalNullifierHash,
    uint256[8] calldata proof
) external view;
```

> **v3 vs v4 (R3/R4):** v3 scopes the nullifier via `externalNullifierHash` (derived from `app_id + action`). v4 (April 2026, finalized Jan 2026 per other rounds — ⚠️ date inconsistent across rounds, verify) scopes via a registered `uint64 rpId` and exposes a `verify(...)` variant. The 6-arg `verifyProof` signature above is the legacy/compatible shape and is what VAR should target for the demo. **Open: confirm which version is deployed on the router you call; if you adopt v4, register an `rpId` with World.** (verify)

### 2.2 `AgentBook.resolveHuman` — the per-transfer hot-path VIEW

VAR-designed (the mirror is ours — see §4). Returns the verified human, or `address(0)` if unregistered.

```solidity
// VAR-side AgentBook mirror interface — VAR is FREE to define this (no canonical World contract)
interface IAgentBook {
    function resolveHuman(address agentWallet) external view returns (address human);
}
```

This is the call inside `EligibilityResolver.isActiveForAmount` (`agentBook.resolveHuman(m.agent) != 0`) that gives VAR "zero new trust assumptions" — eligibility bottoms out in World ID proof-of-human, not a new authority.

### 2.3 WorldIDRouter addresses

> ⚠️ verify before deploy — **do NOT hardcode**; load from `.env` / deployment script and confirm against the live `world-id-contracts` repo and block explorers. R1/R2 returned concrete addresses; one Base/Ethereum value differs by a digit between rounds (transcription risk). The **router is NOT deployed on Arc** — irrelevant for VAR's hot path because verification happens at seed time on a World ID chain, and the per-transfer path reads the Arc-local mirror.

**Mainnet (R1+R2, high confidence on World Chain; ⚠️ verify the rest):**

| Chain | Address / ENS |
|-------|---------------|
| World Chain | `0x17B354dD2595411ff79041f930e491A4Df39A278` |
| Ethereum | `id.worldcoin.eth` → `0x163b09b4fe21177c455d850bd815b6d583732432` |
| Base | `0xBCC7e5910178AFFEEeBA573ba6903E9869594163` ⚠️ verify (R1/R2 differ by one digit) |
| Optimism | `optimism.id.worldcoin.eth` → `0x57f928158C3EE7CDad1e4D8642503c4D0201f611` |
| Polygon | `polygon.id.worldcoin.eth` → `0x515f06B36E6D3b707eAecBdeD18d8B384944c87f` |

**Testnet (R2, ⚠️ verify):** World Chain `0x57f928158C3EE7CDad1e4D8642503c4D0201f611` · Ethereum (Sepolia) `0x469449f251692e0779667583026b5a1e99512157` · Base `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` · Optimism `0x11cA3127182f7583EfC416a8771BD4d11Fae4334`.

---

## 3. Signal & nullifier mechanics (pin these before coding)

### 3.1 Signal binding — agent wallet ↔ proof

The signal locks the proof to **one** agent wallet, preventing cross-wallet proof reuse. **It must match exactly on both sides or the proof reverts.** (high confidence, R2–R4)

```solidity
// Backend / contract side (verifyProof parameter):
bytes32 signalHash = keccak256(abi.encodePacked(agentWallet)).hashToField();
```

```tsx
// Frontend (IDKit) — IDKit internally applies hashToField; pass the raw wallet as signal:
<IDKitWidget
  app_id="app_..."             // Developer Portal
  action="grant-passport"      // scopes the uniqueness claim to VAR's grant action
  signal={agentWalletAddress}  // binds proof to THIS Dynamic-provisioned wallet
  handleVerify={async (result) => { /* POST to backend for server-side verify */ }}
>
  {({ open }) => <button onClick={open}>Verify with World ID</button>}
</IDKitWidget>
```

### 3.2 External nullifier (action context)

Constant for all VAR grant registrations — set once, save gas. Distinct from the signal.

```solidity
bytes32 externalNullifierHash =
    keccak256(abi.encodePacked("verified-agent-rails-agentbook")).hashToField();
```

### 3.3 Nullifier semantics & replay prevention

| Property | Detail |
|----------|--------|
| Deterministic | Same (human, context) → same `nullifierHash`. Enables sybil resistance & per-human rate-limiting. |
| One-time-use | Enforced in **two layers**: protocol-level Oblivious Nullifier Pool (vOPRF nodes, prevents *generation* twice) **+ application-level** `mapping(bytes32 => bool) usedNullifiers` (prevents *use* twice in VAR's context). |
| Unlinkable | Different RPs → different nullifiers. No cross-app tracking, no doxxing. (v4 `rpId` scoping strengthens this vs v3 `app_id`.) |
| No PII | Nullifier ≠ identity, iris code, or key. Unguessable, uniformly distributed. |

> **CONFIRMED responsibility split (R4/R5, high confidence):** The protocol pool does **NOT** replace VAR's on-chain `usedNullifiers` mapping. The pool stops a nullifier being *generated* twice; **VAR's contract must still track `usedNullifiers` to stop one human seeding multiple agents via proof replay.** VAR does NOT skip this mapping.

---

## 4. AgentBook architecture — the resolved blocker

**The single most important finding (R5, high confidence):** **AgentBook is a hosted x402-based service on World Chain/Base, NOT a standalone deployable contract.** There is no canonical World AgentBook contract to inherit, match, or query cross-chain.

Consequences for VAR:

1. **VAR designs its own AgentBook mirror ABI** — `resolveHuman(address) → address` is a free design choice, not a matching task. (Earlier rounds treated the unknown ABI as a blocker; R5 dissolves it.)
2. **Deploy the mirror on Arc**, seed it **once** via World ID proof at grant time, keeping the per-transfer hot path a single Arc-local VIEW. This is the recommended resolution to the R3 cross-chain blocker.
3. The official AgentKit registration flow (gasless CAIP-122 relay on Base/World Chain) is the **reference pattern**, not a dependency VAR must call on the hot path.

### Reference seeding contract (VAR-proprietary, MVP)

```solidity
contract AgentBook {
    mapping(bytes32 => bool) public usedNullifiers;     // one human → one anchor
    mapping(address => address) public agents;          // agentWallet => verified human

    // Seed once at grant time. The ONLY write touching World ID.
    function seedAgent(
        address agentWallet,
        address humanIdentifier,
        bytes32 nullifierHash,
        uint256[8] calldata proof,
        uint256 root,
        uint256 externalNullifierHash
    ) external {
        require(!usedNullifiers[nullifierHash], "Nullifier already used");

        bytes32 signalHash = keccak256(abi.encodePacked(agentWallet)).hashToField();
        worldIdRouter.verifyProof(root, 1 /*Orb*/, uint256(signalHash),
            uint256(nullifierHash), externalNullifierHash, proof);   // stateless VIEW

        usedNullifiers[nullifierHash] = true;
        agents[agentWallet] = humanIdentifier;
        emit AgentRegistered(agentWallet, humanIdentifier);
    }

    // The per-transfer hot-path VIEW called inside isActiveForAmount.
    function resolveHuman(address agentWallet) external view returns (address) {
        return agents[agentWallet];
    }
}
```

### MVP seeding path: server-side verify (Option B)

Chosen per `06_BUILD_PLAN.md` (R4, high confidence). Avoids ~10–50k gas of the on-chain `verifyProof` ceremony (which becomes the STRETCH option):

```
POST /api/v4/verify/{rp_id}     // backend verifies the IDKit proof server-side
  -> check nullifierHash against backend seen-map (one-per-RP per human)
  -> submit AgentBook seed/registration tx (verified-human authority via CAIP-122)
```

```
POST /api/v4/verify/{rp_id}     Content-Type: application/json
{
  "protocol_version": "4.0",
  "nonce": "<uuid>",
  "action": "grant-passport",
  "responses": [{
    "identifier": "orb",
    "merkle_root": "0x...",
    "nullifier": "0x...",
    "proof": ["0x...", ...],      // v4: 5 hex elements
    "signal_hash": "0x...",
    "max_age": <seconds>
  }]
}
// Response: { "success": true, "nullifier": "0x...", "results": [...], "created_at": ... }
```

> ⚠️ **Centralization caveat (R4):** the gasless CAIP-122 relay is World infra — an off-chain dependency NOT covered by VAR's "zero new trust" claim. The VAR-local Arc mirror + direct seeding tx **sidesteps** this; prefer it for the thesis-pure path. If you keep the relay, document the dependency.

---

## 5. AgentKit / x402 / CAIP-122 access flow

For the agent's *runtime* access to gated services (distinct from seeding):

```
1. Service responds 402 Payment Required + CAIP-122 challenge (X-Payment-Challenge)
2. Agent signs the CAIP-122 message with its Dynamic wallet
3. Server verifies the signature, extracts the address
4. Server calls AgentBook.resolveHuman(agentWallet) → if != address(0), human-backed
5. Apply access policy (proof-of-human / payment / both); settle USDC via x402
```

CAIP-122 message shape (R1, high confidence):

```
domain wants you to sign in with your blockchain account:
${agent_wallet_address}

URI: https://world.example.com
Nonce: ${server_nonce}
Issued At: ${iso8601}
Expiration Time: ${expiry}
Chain ID: ${eip155_chain_id}
```

AgentKit middleware exists for Hono/Express/Next.js; an official FastAPI x402 package fits VAR's Python backend. One human × N agents all trace to the same nullifier → rate-limit per human, not per wallet.

---

## 6. Standards alignment (be precise with judges)

| Standard | Role in VAR | Real status |
|----------|-------------|-------------|
| **ERC-7943** `canTransfer` | Token-level pre-transfer hook (uRWA) | **Final** (May 2026). ERC-20 shape: `canTransfer(from, to, amount) view returns (bool)`. Used by CMTAT + Chainlink ACE. |
| **ERC-8004** agent identity | Optional agent-id layer | **Draft**, deployed mainnet **Jan 29, 2026**. `register()` / `register(string)` / `register(string, MetadataEntry[]) → agentId`. **No `grantMandate`** — mandates are not part of 8004. |
| **ERC-8226** `isActiveForAmount` | Eligibility resolver / Mandate | **DOES NOT EXIST as an EIP.** ⚠️ Confirmed across R2–R5 via eips.ethereum.org, ethereum-magicians, GitHub. VAR's `isActiveForAmount`/`grantMandate`/`revokeMandate` are **proprietary**. Adjacent real EIPs: 8001/8118/8126/8183/8273. |

> **Action (R3 DECISION 4):** Treat `ERC-8226` as VAR-proprietary in `CONTRACTS.md`/`ARCHITECTURE.md`/`PRIZES.md`. The "zero new trust assumptions" framing still holds: World ID is trusted, ERC-7943 is Final, the eligibility logic is proprietary-but-transparent. Do not claim 8226 standards alignment.

---

## 7. What this unblocks for the build

- **Lane A — seeding contract (P0):** `AgentBook.seedAgent` is fully specified above. Hour-0 ready.
- **Lane B — eligibility resolver (P0):** `isActiveForAmount` calls `agentBook.resolveHuman(m.agent) != 0` as its World-ID anchor (matches `03_CONTRACTS.md` §5 pseudocode, code `NOT_VERIFIED_HUMAN = 6`).
- **Signal/external-nullifier values pinned** → frontend IDKit widget and contract can be written in parallel against identical constants.
- **MVP path decided** (server-side verify) → no on-chain `verifyProof` gas on the critical path; on-chain ceremony is a documented stretch.
- **Demo climax mechanics confirmed:** revoke is `mandate.revoked = true` (R5 — do NOT clear the nullifier; mark the agent inactive). Next block, `isActiveForAmount → false`, transfer reverts with `MANDATE_REVOKED (code 2)`. "Accountability with one click."
- **Bounty target confirmed:** `$15K` World ID track, ETHGlobal NYC, June 12–14, 2026.
- **Orb-only:** `groupId = 1` (iris). Device credentials are lower-uniqueness and won't register agents / satisfy compliance — enforce Orb.

---

## 8. Residual open questions

| # | Question | Impact | Confidence |
|---|----------|--------|------------|
| 1 | `Mandate.identityRef` / principal binding: store raw `nullifierHash` (privacy: RP-scoped, leaks "from VAR") **or** derive `keccak256(nullifier, agentWallet)` **or** just store `agent` and rely on `resolveHuman`? | Replay prevention + privacy | R4 recommends storing `agent` + on-chain `resolveHuman`; **decide before deploy** |
| 2 | World ID **v3 vs v4** deployed on the router you call; if v4, register `rpId`. Does v4 keep the 6-arg `verifyProof` or only `verify(...)`? | Signature correctness | verify (medium) |
| 3 | Confirm `$15K` track accepts **Arc-testnet** projects (mainnet lands summer 2026, after the June demo). | Prize eligibility | verify with sponsors by presence day |
| 4 | Does the human re-verifying (new Orb/nullifier, principal rotation) lock out an existing agent? Is there a rotation pattern? | Demo robustness | open |
| 5 | Dynamic agent-wallet SDK is Node-only → Python backend needs a sidecar/subprocess; exact `ServerKeyShare` fields + delegation webhook payload shape are inferred. | Agent loop wiring | verify (low/medium) |
| 6 | ERC-1404-style `(code, string)` surfaced cleanly through the ERC-7943 revert path — confirm integration of VAR's code table (`NO_PASSPORT=1 … NOT_VERIFIED_HUMAN=6`). | Machine-readable reverts | convention, verify |
| 7 | World ID date inconsistency across rounds (v4 "April 2026" vs "finalized Jan 2026"). | Cosmetic / accuracy | verify |

---

## 9. Sources

| # | Source | Used for |
|---|--------|----------|
| 1 | `https://docs.world.org/world-id/idkit/onchain-verification` | verifyProof, router addresses, app-level nullifier tracking |
| 2 | `https://docs.world.org/world-id/id/on-chain` | signal encoding, on-chain verification path |
| 3 | `https://docs.world.org/world-id/reference/contracts` | verifyProof signature, contract reference |
| 4 | `https://docs.world.org/world-id/reference/idkit` + `https://github.com/worldcoin/idkit-js` | IDKit widget, signal_hash |
| 5 | `https://docs.world.org/world-id/reference/api` + `https://docs.world.org/api-reference/developer-portal/verify` | `/api/v4/verify` server-side path |
| 6 | `https://github.com/worldcoin/world-id-protocol/blob/main/docs/world-id-4-specs/README.md` | v4 nullifier properties, Oblivious Nullifier Pool |
| 7 | `https://world.org/blog/engineering/introducing-world-id-4-0` | rpId scoping, multi-party entropy |
| 8 | `https://world.org/blog/developers/privacy-deep-dive` | unlinkability, no-PII guarantees |
| 9 | `https://world.org/blog/announcements/now-available-agentkit-proof-of-human-for-the-agentic-web` | **AgentBook = hosted service**, delegation model |
| 10 | `https://docs.world.org/agents/agent-kit/integrate` + `https://github.com/worldcoin/agentkit` | AgentKit registration, CAIP-122 relay |
| 11 | `https://standards.chainagnostic.org/CAIPs/caip-122` | CAIP-122 challenge format |
| 12 | `https://eips.ethereum.org/EIPS/eip-8004` + `https://github.com/erc-8004/erc-8004-contracts` | ERC-8004 register; ERC-8226 non-existence |
| 13 | `https://eips.ethereum.org/erc` / ethereum-magicians | ERC-8226 absence confirmation |
| 14 | `https://x.com/ETHGlobal/status/2057491753511641173` | `$15K` World ID track, ETHGlobal NYC June 12–14 2026 |
| 15 | `https://phemex.com/news/article/circle-unveils-arc-blockchain-whitepaper-mainnet-launch-set-for-summer-2026-82817` | Arc mainnet summer 2026 |
| 16 | `https://github.com/eltociear/agent-passport` | Agent Passport reference (ERC-8004 + ERC-5192) |
| 17 | `https://www.theblock.co/post/393920/...` | x402 + CAIP-122 + World identity toolkit |
| 18 | local: `docs/verified-agent-rails/03_CONTRACTS.md`, `04_INTEGRATIONS.md`, `06_BUILD_PLAN.md` | Mandate struct, code table, Arc/USDC, MVP seeding choice |

> No external bounty/program page surfaced a "`$15K`" amount in R1–R4; the **R5 ETHGlobal NYC sponsor announcement is the confirming source.** Verify Arc-testnet eligibility directly with World sponsors before the demo.
