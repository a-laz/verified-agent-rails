#!/usr/bin/env bash
# Verifies the four deployed contracts on Arc testnet Blockscout (no API key).
# Run from contracts/ after a successful deploy has written ../shared/addresses.json.
set -euo pipefail
cd "$(dirname "$0")"

command -v jq >/dev/null || { echo "jq is required (brew install jq)"; exit 1; }

ADDRESSES=../shared/addresses.json
VERIFIER_ARGS=(--verifier blockscout --verifier-url 'https://testnet.arcscan.app/api/' --chain-id 5042002 --watch)

MIRROR=$(jq -r '.DelegationMirror.address' "$ADDRESSES")
TOKEN=$(jq -r '.GatedUSD.address' "$ADDRESSES")
VAULT=$(jq -r '.MockYieldVault.address' "$ADDRESSES")
SINK=$(jq -r '.ServiceSink.address' "$ADDRESSES")

[ -n "$MIRROR" ] && [ "$MIRROR" != "null" ] || { echo "addresses.json has no deployment; run Deploy.s.sol first"; exit 1; }

forge verify-contract "${VERIFIER_ARGS[@]}" "$MIRROR" src/DelegationMirror.sol:DelegationMirror

forge verify-contract "${VERIFIER_ARGS[@]}" "$TOKEN" src/GatedUSD.sol:GatedUSD \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$MIRROR")"

forge verify-contract "${VERIFIER_ARGS[@]}" "$VAULT" src/MockYieldVault.sol:MockYieldVault \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$TOKEN")"

forge verify-contract "${VERIFIER_ARGS[@]}" "$SINK" src/ServiceSink.sol:ServiceSink \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$TOKEN")"

echo "All four contracts submitted for verification."
