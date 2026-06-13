# Integrations (World ID · Dynamic · Arc/Circle)

_How Verified Agent Rails (VAR) wires three sponsor stacks into one build: humanity proof, agent wallet, and stablecoin settlement._

This doc has one section per sponsor integration. Each covers: **what it provides**, the **exact integration surface** (SDK calls / on-chain verifier / RPC), **where it plugs into VAR**, and the **hackathon gotchas**. Function signatures and addresses are drawn from the research bundle; anything not in the bundle is marked `TBD — confirm in docs` and listed for verification.

## VAR at a glance

The composition chain that every transfer flows through:

```
token transfer
  -> ERC-7943 canTransfer(...)          [token-level pre-transfer hook, Final]
    -> ERC-8226 isActiveForAmount(...)  [eligibility resolver / Agent Passport mandate, Draft]
      -> AgentBook                      [on-chain registry, seeded from World ID proof-of-human]
```

- **Agent Passport** = the on-chain, signed attestation that an agent acts for a verified human.
- **Mandate** = the scoped permission the passport carries: spend cap, asset whitelist, expiry, revocable at will.
- **AgentBook** = the on-chain registry/mirror that resolves eligibility, anchored by World ID.
- **Hot path** = the per-transfer check is a single on-chain VIEW call. No paymaster, no relayer, no off-chain attestation in the hot path.

| Sponsor | Role in VAR | Layer |
|---------|-------------|-------|
| **World ID** | Proof-of-human; seeds AgentBook; anchors the Agent Passport to a verified person | Identity / humanity |
| **Dynamic** | Provisions the agent wallet; signs the agent-loop transactions programmatically | Agent execution |
| **Arc / Circle** | Hosts the gated token + USDC settlement; nanopayments for API-call payments | Settlement |

---

## 1. World ID — proof-of-human, anchoring the Passport

### What it provides
A privacy-preserving biometric proof that a unique human stands behind the agent. World ID issues a zero-knowledge proof carrying a **nullifier** (one-per-person, per-context) and an optional **signal** that binds the proof to a specific action or wallet. No PII, names, or emails — only the nullifier and signal are exposed; iris code, biometrics, and identity key stay hidden. This is the "verify once" step that seeds AgentBook.

### Integration surface

**Frontend — IDKit button (the "Verify with World ID" click in the grant panel):**

```tsx
<IDKitWidget
  app_id="app_..."          // from Developer Portal
  action="grant-passport"   // scopes the uniqueness claim to VAR's grant action
  signal={agentWalletAddress} // binds proof to THIS agent wallet
  handleVerify={async (result) => { /* POST to backend for server-side verify */ }}
>
  {({ open }) => <button onClick={open}>Verify with World ID</button>}
</IDKitWidget>
```

**On-chain verifier (World ID Router):**

```solidity
function verifyProof(
  uint256 root,
  uint256 groupId,            // 1 for Orb credentials
  uint256 signalHash,         // keccak256(signal) — binds to agent wallet
  uint256 nullifierHash,      // track on-chain to prevent replay
  uint256 externalNullifierHash,
  uint256[8] calldata proof
) external view;
```

The Router is deployed on Ethereum, World Chain, Optimism, Polygon, and Base (`groupId = 1` for Orb). It is a VIEW function and does **not** itself prevent replay — our contract must track seen `nullifierHash` values.

**AgentBook anchoring (AgentKit):** AgentKit registers an agent wallet against a verified human in AgentBook, gasless by default via a hosted relay, on World Chain or Base. Registration verifies a CAIP-122 signed message and resolves the registering human from AgentBook on-chain.

```
npx @worldcoin/agentkit-cli register <wallet-address>
  -> World App generates proof
  -> AgentBook on-chain registration (CAIP-122 signed message)
```

### Where it plugs into VAR
1. Human clicks **Verify with World ID** in the grant/revoke panel (frontend reuses the template's thin delegation UI).
2. `signal = agentWalletAddress` binds the proof to the exact wallet Dynamic provisioned (Section 2).
3. The verified human + agent wallet are anchored in **AgentBook**. ERC-8226's `isActiveForAmount` resolves eligibility against this AgentBook mirror in the hot path.
4. Result: "this agent acts on behalf of this verified human" becomes on-chain truth with **zero new trust assumptions** beyond World ID.

### Gotchas
- **You must track `nullifierHash` server-side / on-chain.** `verifyProof` does not block replay; enforce one-per-person yourself via a seen-nullifier mapping.
- **Signal must match on both sides.** Frontend passes `signal = walletAddress`; backend/contract must compute `keccak256(walletAddress)` identically or the proof fails.
- **`externalNullifierHash` is separate context binding** from `signal`. Document VAR's external-nullifier value to avoid a security bug.
- **Verify server-side, never client-side only.** Submit to `verifyProof` on-chain (or via a backend route) before trusting the result.
- **AgentKit requires an Orb visit** (biometric enrollment) at least once; legacy credentials won't register agents, and `groupId` must be `1`.
- **AgentBook is chain-specific** (currently World Chain / Base). Cross-chain agent verification means bridging the registration or querying multiple AgentBook contracts — relevant since our settlement is on Arc (see open questions).
- **L2 Merkle root latency** ~5 min (Polygon ~40 min). A proof made right after a root update may fail until it propagates; tolerate recent roots.
- **World ID proves uniqueness, not auth.** Pair proof + wallet signature to map the human to a session.
- ⚠️ verify (medium confidence): the exact AgentBook lookup interface (CAIP-122 resolve path, contract address) — `TBD — confirm in docs`.

---

## 2. Dynamic — the agent wallet + programmatic signing

### What it provides
TSS-MPC embedded/server wallets for autonomous agents. The agent gets delegated signing credentials and signs transactions/messages via multi-party computation — the full private key is never reconstructed during signing. This is the wallet the agent loop drives.

### Integration surface

**Provision / delegate:** the user approves delegation; Dynamic sends credentials (`walletId`, `walletApiKey`, `keyShare` / `ServerKeyShare`) to the agent backend via webhook. The backend then signs on the agent's behalf.

**Primary SDK:** `@dynamic-labs-wallet/node-evm` (Node.js/TypeScript, server-side only).

```ts
const client = createDelegatedEvmWalletClient({ apiKey, environmentId });

// sign the agent-loop transaction (pay / park-yield)
const signedTx: string = await delegatedSignTransaction(client, {
  walletId,
  walletApiKey,
  keyShare,                  // ServerKeyShare from delegation webhook
  transaction,               // TransactionSerializable — already formatted
}); // -> signed tx hex, ready to broadcast
```

`delegatedSignMessage(client, { walletId, walletApiKey, keyShare, message })` signs raw EIP-191 messages (useful for the CAIP-122 / AgentBook registration step in Section 1). `createWalletAccount({ thresholdSignatureScheme })` creates a fresh embedded wallet server-side ⚠️ verify (medium confidence on exact return fields).

**Adding the Arc chain** (custom EVM network):

```ts
const arcTestnet = {
  chainId: 5042002,                          // Arc testnet
  chainName: "Arc Testnet",
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 }, // native = 18-decimal, see Section 3
};
```

Dynamic supports custom EVM chains via `evmNetworks`; Arc is EVM-compatible (testnet chainId `5042002`, mainnet `1243`).

### Where it plugs into VAR
- The **backend agent** (template's orchestrator/specialist loop) holds the delegation credentials and runs **check-eligibility → pay → park-yield**, signing each on-chain action via `delegatedSignTransaction`.
- The wallet address provisioned here is the **`signal`** bound by World ID (Section 1) and the **sender** the gated token checks via `canTransfer` (Section 3).
- **Revoke** is enforced at the mandate layer, not in Dynamic: when the human revokes the passport, the next block the agent's transfers fail `isActiveForAmount` — the agent is dead even though it still holds signing credentials. No kill switch to ship.

### Architecture note (Python backend)
The template backend is FastAPI/Python, but **Dynamic's agent-wallet SDK is Node-only** — no documented Python SDK. Bridge options:
- Run a thin Node sidecar exposing `delegatedSignTransaction` over HTTP, called from the Python agent loop, **or**
- Call the Node SDK via subprocess from Python.

⚠️ verify (medium confidence): "no Python SDK" is from an unverified source — confirm before committing to a sidecar. `TBD — confirm in docs`.

### Gotchas
- **TSS-MPC is closed alpha** — request access for your environment. Standard embedded wallets are production-ready but may not give the full TSS model yet.
- **Delegation credentials are powerful and temporary.** `walletApiKey` + `keyShare` let the agent sign without re-approval — store securely server-side; that *is* the trust model.
- **Dynamic does not validate transaction logic** — it signs whatever serializable tx you pass. A bad tx gets signed and broadcast. The mandate (ERC-8226) is the real guardrail, not Dynamic.
- **MPC signing has latency** — expect ~5–10s per signature (server round-trip + TEE ceremony), not sub-second. Budget this into the demo timing.
- **Webhook reliability is critical** — if the delegation webhook fails, the agent can't sign. Add retry / dead-letter handling.
- **Enable Arc in the dashboard if available**, otherwise pass the full `evmNetworks` config manually.
- ⚠️ verify (low/medium confidence): exact `ServerKeyShare` fields and the delegation webhook payload shape are inferred, not documented — `TBD — confirm in docs`.

---

## 3. Arc / Circle — gated token + USDC settlement

### What it provides
Arc is Circle's EVM-compatible Layer-1 for stablecoin finance: USDC is the **native gas token** (~$0.01/tx), sub-second finality, and a **dual-decimal USDC** model. We deploy the demo gated token here and settle agent payments in USDC. Nanopayments give gasless sub-cent USDC transfers for the API-call payment.

### Integration surface

**Network (testnet):**

| Field | Value |
|-------|-------|
| Chain ID | `5042002` (mainnet `1243`) |
| RPC | `https://rpc.testnet.arc.network` (also Alchemy/dRPC/ThirdWeb/Quicknode) |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` (dispenses test USDC for gas) |

Testnet is live now (since Oct 2025); **mainnet expected summer 2026** — build on testnet immediately. ⚠️ verify: mainnet mechanics/addresses may change at launch — no backward-compat guarantee.

**USDC contract (dual-decimal, single precompile):**

```
Address:        0x3600000000000000000000000000000000000000
Native:         18 decimals  (gas metering, low-level)
ERC-20:         6  decimals  (transfer, approve, balanceOf, transferFrom)
```

One token, two interfaces kept in sync by a precompile. **Use the ERC-20 (6-decimal) interface for all balance reads and transfers** to stay tool-compatible and avoid double-counting.

**Gated token (the VAR demo asset):** a standard ERC-20 deployed on Arc (fully EVM-compatible — Hardhat/Foundry/ethers.js, or Circle's pre-audited fee-sponsored templates) that implements the **ERC-7943** pre-transfer hook:

```solidity
// ERC-7943 (Final) — token-level pre-transfer hook, ERC-20 variant
function canTransfer(address from, address to, uint256 amount)
  external view returns (bool allowed);

// our implementation delegates to ERC-8226 (Draft) eligibility resolver:
function isActiveForAmount(uint256 agentId, address principal, uint256 amount)
  public view returns (bool); // active mandate AND amount within all limits
```

The full chain: token `transfer` → `canTransfer` → `isActiveForAmount` → AgentBook (seeded from World ID). All three are VIEW calls on one revert path — the **hot path** stays a single on-chain check with no paymaster/relayer/off-chain attestation.

**Machine-readable revert reason:** surface an ERC-1404-style restriction code + human string (`detectTransferRestriction` / `messageForTransferRestriction` style) through the 7943/8226 revert path, so a rejected transfer says *why* (no passport / over cap / expired / asset not whitelisted) rather than reverting blind. ⚠️ verify: ERC-1404 helpers are a convention we layer on; confirm exact integration into the 7943 revert. `TBD — confirm in docs`.

**Settlement + idle-yield (the agent loop):**
- Agent pays for a service (API call, data feed) in **USDC on Arc**.
- Idle balance is swept to a **yield instrument the mandate permits** (asset-whitelist enforced by `isActiveForAmount`).

**Nanopayments (gasless sub-cent USDC) for the API-call payment:**

```
Agent funds Circle Gateway balance (USDC, once)
  -> signs EIP-3009 off-chain authorization (min $0.000001)
  -> Gateway verifies signature + balance instantly, merchant confirms sub-second
  -> Gateway batches authorizations -> single on-chain settlement later
```

SDK: `github.com/circlefin/arc-nanopayments`. For autonomous **x402** API payments, official FastAPI package exists (fits the template's Python backend): agent `GET /resource` → server `402` + instructions → agent signs USDC authorization → retries with proof → facilitator settles.

### Where it plugs into VAR
- The **gated token** lives on Arc and is the asset the demo agent tries to move. Its `canTransfer` is where VAR's whole thesis is enforced — "the money itself refuses to move unless the caller is a verified agent under an unrevoked mandate."
- The **agent loop** (Dynamic-signed, Section 2) calls the gated token / USDC transfers and the nanopayment authorization for the per-call API payment.
- **Demo arc:** agent pays (clears `canTransfer`), sweeps idle funds to yield, then human revokes → next block the agent's transfers revert with a machine-readable reason.

### Gotchas
- **Dual-decimal trap:** native (18) and ERC-20 (6) share one balance. Mixing them double-counts. Always use the ERC-20 interface for user-facing logic.
- **Nanopayments require a funded Circle Gateway balance** — agents can't pay from arbitrary USDC addresses; settlement is batched, so merchants must accept batched-settlement delay. Real-time on-chain confirmation still costs full gas (~$0.01).
- **x402 needs x402-aware servers + facilitator** — not all APIs support it; have a traditional-auth fallback for the demo API.
- **Arc mainnet isn't live yet** (summer 2026). RPC endpoints, contract addresses, and fee structure may change at mainnet — pin testnet for the hackathon.
- **EVM compatibility is high but not 100%** — test the gated token thoroughly on Arc testnet; no Chainlink oracle precompiles announced as of mid-2026 (matters if the yield instrument needs price feeds).
- **Circle Paymaster** adds +10% only for **non-USDC** stablecoin gas. Native USDC gas has no surcharge — the standard VAR path holds USDC and pays no Paymaster overhead.
- **ERC-8226 / ERC-8004 are Draft** and ERC-8004 only hit mainnet Jan 2026 — early-adoption risk; interfaces may evolve. ERC-7943 is Final.
- **`recordExecution` must be called on every agent transfer** to enforce cumulative caps — partial/off-chain recording breaks the compliance guarantee.
- ⚠️ verify (medium): proof-of-human is **not** native to 7943/8226/8004 — these delegate to an `IComplianceProvider`/Validation Registry; our AgentBook-from-World-ID seeding is the layer *we* add, not something the EIPs define.

---

## Standards status (call it out for judges)

| Standard | Role in VAR | Status |
|----------|-------------|--------|
| **ERC-7943** | Token-level `canTransfer` pre-transfer hook (uRWA) | **Final** |
| **ERC-8226** | `isActiveForAmount` eligibility resolver / mandate | **Draft** |
| **ERC-8004** | Agent identity layer | **Draft** |

VAR composes all three against a real proof-of-human (World ID → AgentBook) — the reference implementation nobody has shipped yet.

---

## Open questions / verify before demo

These map to `claimsNeedingVerification`:

- Exact AgentBook lookup/resolve interface and contract address (CAIP-122 path).
- Whether Dynamic truly has no Python SDK (drives the Node-sidecar decision).
- Exact `ServerKeyShare` fields and the Dynamic delegation webhook payload shape.
- Cross-chain story: AgentBook lives on World Chain / Base; the gated token + settlement live on Arc — confirm how `isActiveForAmount` resolves AgentBook from Arc (bridge, mirror, or oracle).
- ERC-1404-style restriction codes wiring into the 7943/8226 revert path.
- Arc mainnet parity (addresses, fees, RPC) once it launches.
- `IComplianceProvider` exact interface used by ERC-8226 for principal eligibility.
