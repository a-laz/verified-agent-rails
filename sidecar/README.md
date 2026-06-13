# VAR Sidecar — Dynamic Signer (production seam)

The **signing seam** for Verified Agent Rails. This Node/Express service exposes a
single endpoint that signs an agent transaction, trying Dynamic's TSS-MPC server
wallet first and falling back to local key signing so the local demo always runs.

> **Swap note:** the backend MVP signs transactions **locally** with `eth-account`
> inside `backend/src/var/chain.py`. This sidecar is the **parallel artifact / production
> seam** (SPEC §5): in production, `chain.py` would POST the unsigned transaction here
> and broadcast the returned `signedTransaction`, moving the agent's private key out of
> the backend and into Dynamic's MPC wallet. Nothing in the local end-to-end arc depends
> on this service running.

## Endpoints

### `POST /sign-transaction`
Request:
```json
{ "transaction": { "to": "0x...", "value": "0x0", "data": "0x...", "chainId": 31337 } }
```
Response (signed by Dynamic):
```json
{ "ok": true, "signer": "dynamic", "signedTransaction": "0x02f8..." }
```
Response (local fallback — Dynamic unavailable or creds missing):
```json
{ "ok": true, "signer": "local", "fallbackReason": "...", "signedTransaction": "0x02f8..." }
```

Behavior:
1. Tries Dynamic `@dynamic-labs-wallet/node-evm` `delegatedSignTransaction` using
   `DYNAMIC_ENVIRONMENT_ID` / `DYNAMIC_API_TOKEN`.
2. On **any** failure or missing creds (including the Dynamic package not being
   installed), falls back to local signing with `ethers Wallet(CHAIN_AGENT_KEY)`.
   Missing `nonce` / `gas` / `chainId` are populated from `CHAIN_RPC_URL`.

### `GET /health`
```json
{ "ok": true, "service": "var-sidecar", "signer": "local", "dynamicAvailable": false, "dynamicConfigured": true, "chainRpcUrl": "http://127.0.0.1:8545" }
```

## Environment

Env is loaded from **`../backend/.env`** (the same file `chain.py` reads), so the
sidecar shares the backend's secrets. Relevant variables:

| Var | Default | Purpose |
|---|---|---|
| `CHAIN_RPC_URL` | `http://127.0.0.1:8545` | RPC used to populate nonce/gas/chainId for local fallback |
| `CHAIN_AGENT_KEY` | Hardhat account[1] key | local fallback signer (the AGENT wallet) |
| `DYNAMIC_ENVIRONMENT_ID` | _(from .env)_ | Dynamic environment for delegated signing |
| `DYNAMIC_API_TOKEN` | _(from .env)_ | Dynamic API auth token |
| `DYNAMIC_WALLET_ID` | _(optional)_ | specific Dynamic server-wallet id, if used |
| `SIDECAR_PORT` | `8787` | port this service listens on |

The hardhat account[1] key is a public test key (local only).

## Run

```bash
cd sidecar
npm install          # installs express, dotenv, ethers (Dynamic pkg is optional)
npm start            # node server.js  ->  http://127.0.0.1:8787
```

The `@dynamic-labs-wallet/node-evm` package is an **optionalDependency**; if it is
not installed, the import is caught and the service runs in local-signing mode.

Quick check:
```bash
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/sign-transaction \
  -H 'content-type: application/json' \
  -d '{"transaction":{"to":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","value":"0x0"}}'
```
