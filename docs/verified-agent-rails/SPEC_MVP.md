# VAR MVP — Locked Build Spec

_The single source of truth for the end-to-end local build. Every lane (contracts / backend / frontend / sidecar) codes against THIS. Signatures, box keys, addresses, and the account map are binding._

## 0. Scope & local substitutions

Goal: the full demo arc — **reject → grant → clear → pay → park-yield → revoke → locked-out** — running **locally end-to-end** on a Hardhat node, with clean swap points for the real sponsor stacks.

| Real (production) | Local MVP substitute | Swap point |
|---|---|---|
| Arc testnet (`5042002`) | Hardhat node (`31337`) | `CHAIN_RPC_URL` env; deploy script runs against either |
| Dynamic TSS-MPC signing | local `eth-account` keys in `chain.py` (Node sidecar is a parallel artifact) | `chain.py` signer / sidecar `/sign-transaction` |
| World ID Orb proof | server-side `seed()` call with a deterministic nullifier | `AgentBook.seed(...)` |
| Real USDC on Arc | `GatedToken` ("Gated USDC", `gUSDC`, 6 decimals) deployed locally | token address in `deployment.json` |

Per the research decisions (`DECISIONS.md`): **per-transaction spend caps only** (pure VIEW), Mandate **keyed by agent-wallet address**, **revert in the token's `_update` hook** (not in `canTransfer`), AgentBook is a **local mirror**, yield is a **1:1 stub vault**.

## 1. Account map (Hardhat default accounts)

| Role | Account | Use |
|---|---|---|
| **OWNER / HUMAN / principal** | `accounts[0]` | deploys; grants/revokes the mandate; the verified human |
| **AGENT** | `accounts[1]` | the autonomous agent wallet; holds gUSDC; pays + parks |
| **SERVICE** | `accounts[2]` | payment recipient (the "API/data service") |

Hardhat account[0] key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`; account[1] `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`; account[2] `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`. (Public test keys — local only.)

## 2. Contracts (Solidity 0.8.24, OpenZeppelin 5.x)

Composition: `GatedToken._update → EligibilityResolver.restrictionCode → AgentBook.resolveHuman`.

### 2.1 Restriction codes (binding — used across all lanes)
`0=OK, 1=NO_PASSPORT, 2=MANDATE_REVOKED, 3=MANDATE_EXPIRED, 4=OVER_SPEND_CAP, 5=ASSET_NOT_WHITELISTED, 6=NOT_VERIFIED_HUMAN`. Messages: OK→"Transfer allowed", 1→"Sender carries no Agent Passport", 2→"Mandate revoked by principal", 3→"Mandate expired", 4→"Amount exceeds per-transaction spend cap", 5→"Asset not permitted by mandate", 6→"Agent not anchored to a verified human".

### 2.2 `AgentBook.sol` (Ownable)
```solidity
mapping(address => address) private _human;        // agent => human
mapping(uint256 => address) private _nullifierOwner; // nullifierHash => agent (replay guard)
function seed(address agent, address human, uint256 nullifierHash) external onlyOwner; // sets anchor; if nullifierHash!=0, require _nullifierOwner[nullifierHash] is 0 or == agent (idempotent re-seed of same agent ok), then record
function clearAnchor(address agent) external onlyOwner;
function resolveHuman(address agent) external view returns (address);
event Seeded(address indexed agent, address indexed human, uint256 nullifierHash);
```

### 2.3 `EligibilityResolver.sol` (Ownable) — VAR's self-defined resolver (NOT "ERC-8226"; it does not exist publicly — name it ours)
```solidity
struct Mandate { address human; address agent; uint256 spendCap; address asset; uint64 expiry; bool revoked; bool exists; }
mapping(address => Mandate) public mandates;   // keyed by AGENT address (D9)
AgentBook public agentBook;
constructor(address agentBook_);
function grantMandate(address agent, address human, uint256 spendCap, address asset, uint64 expiry) external onlyOwner; // sets mandate{...,revoked:false,exists:true}; emit MandateGranted
function revokeMandate(address agent) external onlyOwner;          // mandate.revoked = true; emit MandateRevoked
function extendMandate(address agent, uint64 newExpiry) external onlyOwner;
// THE HOT-PATH VIEW — per-transaction cap, pure view, never reverts:
function restrictionCode(address agent, address asset, uint256 amount) public view returns (uint8);
//   1 if !exists||human==0 ; 2 if revoked ; 3 if block.timestamp>=expiry ; 4 if amount>spendCap ;
//   5 if asset!=m.asset ; 6 if agentBook.resolveHuman(agent)==0 || != m.human ; else 0
function messageForRestriction(uint8 code) public pure returns (string memory);
// ERC-8226-SHAPED wrapper (documents the composition; agentId == uint160(agent)):
function isActiveForAmount(uint256 agentId, address principal, uint256 amount) external view returns (bool);
//   returns restrictionCode(address(uint160(agentId)), mandates[address(uint160(agentId))].asset, amount) == 0
event MandateGranted(address indexed agent, address indexed human, uint256 spendCap, address asset, uint64 expiry);
event MandateRevoked(address indexed agent);
```

### 2.4 `GatedToken.sol` (ERC20 + Ownable, 6 decimals)
```solidity
EligibilityResolver public resolver;
error TransferRestricted(uint8 code, string message);
constructor(address resolver_, string name_, string symbol_); // ERC20(name_,symbol_) Ownable(msg.sender)
function decimals() public pure override returns (uint8); // 6
function mint(address to, uint256 amount) external onlyOwner; // demo funding
// enforcement in the state-changing hook (D10/H2):
function _update(address from, address to, uint256 value) internal override {
    if (from != address(0) && to != address(0)) { // skip mint/burn
        uint8 code = resolver.restrictionCode(from, address(this), value);
        if (code != 0) revert TransferRestricted(code, resolver.messageForRestriction(code));
    }
    super._update(from, to, value);
}
// pure VIEW probes — MUST NOT revert:
function canTransfer(address from, address to, uint256 amount) external view returns (bool); // restrictionCode(from,this,amount)==0
function detectTransferRestriction(address from, address to, uint256 amount) external view returns (uint8); // restrictionCode(from,this,amount)
function messageForTransferRestriction(uint8 code) external view returns (string memory); // resolver.messageForRestriction(code)
```

### 2.5 `YieldVault.sol` — 1:1 stub (ERC-4626-ish; cuttable P2)
```solidity
IERC20 public immutable asset; // the GatedToken
mapping(address => uint256) public balanceOf; // shares == deposited assets (1:1)
uint256 public totalAssets;
constructor(address asset_);
function deposit(uint256 assets, address receiver) external returns (uint256 shares); // asset.transferFrom(msg.sender,this,assets) -> shares[receiver]+=assets (pull triggers the gate on `from`)
function withdraw(uint256 assets, address receiver, address owner_) external returns (uint256 shares);
```
Note: `deposit` pulls gUSDC from the agent via `transferFrom`, so the move is gated by the agent's mandate (asset==GatedToken). The agent must `approve(vault, amount)` first (approve is not gated).

### 2.6 Tests (`test/var.t.js`, Hardhat + chai) — MUST cover the arc
1. transfer before grant → reverts `TransferRestricted(1, ...)`.
2. `grantMandate` + `seed` → `canTransfer` true; transfer to SERVICE succeeds; over-cap transfer reverts code 4; non-whitelisted asset path reverts code 5 (use a 2nd token or asset!=this).
3. `park`: agent approves vault, `vault.deposit` succeeds, shares == assets.
4. `revokeMandate` → next transfer reverts code 2 (the kill shot).
5. expiry path → code 3.

### 2.7 `scripts/deploy.js`
Deploys AgentBook → EligibilityResolver(agentBook) → GatedToken(resolver,"Gated USDC","gUSDC") → YieldVault(token). Mints `1_000_000e6` gUSDC to AGENT. Writes **`contracts/deployment.json`**:
```json
{ "network":"localhost","chainId":31337,
  "addresses":{"AgentBook":"0x..","EligibilityResolver":"0x..","GatedToken":"0x..","YieldVault":"0x.."},
  "accounts":{"owner":"0x..","agent":"0x..","service":"0x.."} }
```
Also copies ABIs to **`backend/src/var/abis/*.json`** (or deploy writes a combined `backend/src/var/deployment.json` the backend reads). Keep ABIs + addresses where the backend can load them.

## 3. Backend (`backend/src/var/` + `routers/var.py` + agent)

Env (in `backend/.env`): `CHAIN_RPC_URL` (default `http://127.0.0.1:8545`), `ARC_TESTNET_RPC_URL`, `CHAIN_OWNER_KEY`/`CHAIN_AGENT_KEY` (default to the hardhat keys above for local), `DYNAMIC_*` (sidecar).

### 3.1 `backend/src/var/chain.py`
Loads `deployment.json` + ABIs, web3 (`Web3(HTTPProvider(CHAIN_RPC_URL))`), local `eth-account` signers for owner & agent. Functions (each returns a dict `{ok, code, message, txHash, ...}`):
- `get_mandate() -> dict` (reads `mandates[agent]`, resolveHuman) ; `get_balances() -> dict` (token.balanceOf agent/service, vault.balanceOf agent)
- `grant(spend_cap_6dec:int, expiry_minutes:int)` → owner: `seed(agent,human,nullifier)` then `grantMandate(agent,human,cap,token,expiry)`
- `revoke()` → owner: `revokeMandate(agent)`
- `probe(amount:int) -> {code,message}` → `token.detectTransferRestriction(agent, service, amount)`
- `pay(amount:int)` → probe; if code==0 send `token.transfer(service, amount)` from AGENT; else return the code without sending
- `park(amount:int)` → AGENT `token.approve(vault, amount)` then `vault.deposit(amount, agent)`
Decode `TransferRestricted` custom errors from reverts where possible; always fall back to `detect...` for the code.

### 3.2 `backend/src/agents/var_agent.py` — `create_var_agent(storage) -> Agent`
Tools (signature `(agent, **kwargs) -> str`, box + return json):
- `check_eligibility(amount)` → `chain.probe`; box `var/status` + `var/mandate`.
- `pay(amount)` → `chain.pay`; box `var/status`, append `var/tx_feed`.
- `park_yield(amount)` → `chain.park`; box `var/status`, `var/balances`, append `var/tx_feed`.
Register in `AGENT_FACTORIES` (`backend/src/agents/__init__.py`) as `"VAR"`.

### 3.3 `backend/src/routers/var.py` (router isolation — register via `include_router` only)
- `POST /api/var/grant` `{spendCap, expiryMinutes}` → chain.grant ; box mandate ; return result
- `POST /api/var/revoke` → chain.revoke
- `POST /api/var/pay` `{amount}` → chain.pay
- `POST /api/var/park` `{amount}` → chain.park
- `POST /api/var/check` `{amount}` → chain.probe
- `GET  /api/var/state` → `{mandate, balances}` (also boxes them)

### 3.4 Box keys (binding — frontend reads these)
- `var/status` → `{state, action, ok, code, message, txHash}`  (state ∈ idle|rejected|cleared|paid|parked|revoked)
- `var/mandate` → `{agent, human, spendCap, asset, expiry, revoked, active}`
- `var/balances` → `{agentToken, serviceToken, vaultShares}` (human-readable, 6-dec → decimal)
- `var/tx_feed` → `[{action, ok, code, message, txHash, amount, ts}]` (newest first, cap 20)

## 4. Frontend (`frontend/src/agents/VAR/`)

Widgets (read box via `useBox`, design tokens only, `"use client"`):
- `GrantRevokePanel.tsx` — cap input, expiry input, **Grant** + **Revoke** buttons (POST to `/api/proxy/api/var/...`), "Verify with World ID" button (stub → calls grant; label it a local stub). Shows mandate active/revoked.
- `MandateWidget.tsx` — box `var/mandate` (cap, expiry countdown, revoked badge).
- `AgentStatusWidget.tsx` — box `var/status` (state + last restriction code/message, with **Pay**/**Park**/**Check** trigger buttons hitting the var router).
- `TxFeedWidget.tsx` — box `var/tx_feed`.
- `manifest.ts` — register the 4 widgets (mirror `ExampleApp/manifest.ts`).
Wire the VAR manifest into the app (mirror how `ExampleApp` is registered in `page.tsx`/AgentManifest). Frontend talks to the backend through the existing `/api/proxy/[...path]` route.

## 5. Node sidecar (`sidecar/`) — Dynamic signer (parallel artifact)
`server.js` (Express): `POST /sign-transaction {transaction}` → tries Dynamic `@dynamic-labs-wallet/node-evm` `delegatedSignTransaction` using `DYNAMIC_ENVIRONMENT_ID`/`DYNAMIC_API_TOKEN`; **falls back to local `eth-account`/ethers signing with `CHAIN_AGENT_KEY`** so the local demo always runs. `package.json`, `.env` read from `../backend/.env`, README with the swap note. The backend MVP signs locally in `chain.py`; the sidecar is the production seam.

## 6. Run flow (what "end to end" means)
1. `npm --prefix contracts run node` (hardhat node, chain 31337) in one terminal.
2. `npm --prefix contracts run deploy:local` → writes `deployment.json` + ABIs to backend.
3. `backend` (venv) `uvicorn src.main:app --port 8000`.
4. `frontend` `npm run dev` (:3000).
5. Demo script `scripts/demo_arc.py` (backend venv) walks: check(reject)→grant→check(clear)→pay→park→revoke→check(reject), printing the restriction code at each gate. This script is the headless proof the arc works even without the UI.
