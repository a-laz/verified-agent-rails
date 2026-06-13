# Verified Agent Rails

ETHGlobal New York 2026 hackathon project.

A human verifies with World ID and delegates scoped authority to an AI agent. An onchain registry on Circle's Arc testnet (the DelegationMirror) holds the mandate: principal, World ID nullifier, per-tx spend cap, expiry, revoked flag, allowed token. A gated ERC-20 checks the registry before any transfer and reverts with machine-readable reason codes. The agent pre-checks eligibility, pays a service in the gated token, and sweeps idle balance to a mock yield vault. Revocation is local and instant.

Standards: ERC-7943 canTransfer (Final) as the compliance surface, registry vocabulary aligned with ERC-8226 (RAMS, Draft): mandate, principal, scoped authority.

## Layout

- `contracts/` Foundry project: DelegationMirror, GatedUSD, MockYieldVault, ServiceSink
- `agent/` Node + TypeScript agent (Dynamic MPC server wallet, Saturday workstream)
- `web/` Next.js app (Saturday workstream)
- `shared/` addresses, ABIs, reason codes, USDC helpers, viem chain definition

## Target chain

Arc testnet, chain id 5042002. Native gas is USDC at 18 decimals; ERC-20 USDC is 6 decimals. All token amounts in this codebase go through `shared/src/parseUSDC.ts`.

## Runbook

```sh
# test
cd contracts && forge test

# fund the deployer with testnet USDC gas
open https://faucet.circle.com

# deploy (writes shared/addresses.json)
cd contracts
cp .env.example .env   # fill in DEPLOYER_PRIVATE_KEY
set -a; source .env; set +a
forge script script/Deploy.s.sol --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast

# verify on Blockscout (no API key)
./verify.sh

# regenerate ABIs after contract changes
cd shared && npm run build:abis
```

## Secret guard

A local pre-commit hook blocks commits that contain Dynamic tokens, raw private keys, or PEM blocks. Enable it once per clone:

```sh
git config core.hooksPath .githooks
```

It runs `scripts/scan-secrets.sh` on staged files. Append `# pragma: allowlist secret` to a line to suppress a false positive. You can run it manually over all tracked files any time with `bash scripts/scan-secrets.sh`.
