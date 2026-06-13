// Verified Agent Rails — Dynamic signer sidecar.
//
// This is the PRODUCTION SIGNING SEAM (SPEC §5). The backend MVP signs
// transactions locally with eth-account inside backend/src/var/chain.py.
// This Express service is the parallel artifact that swaps in Dynamic's
// TSS-MPC server wallet for delegated signing — and falls back to local
// ethers signing so the local end-to-end demo always runs.
//
// POST /sign-transaction { transaction }
//   1. Try Dynamic @dynamic-labs-wallet/node-evm delegatedSignTransaction
//      using DYNAMIC_ENVIRONMENT_ID / DYNAMIC_API_TOKEN.
//   2. On ANY failure or missing creds, fall back to local signing with
//      ethers Wallet(CHAIN_AGENT_KEY).
//   Always returns a signed raw transaction.
//
// GET /health  -> { ok, signer, dynamicAvailable }

"use strict";

const path = require("path");
const express = require("express");
const { ethers } = require("ethers");

// Load env from the backend so the sidecar shares the same secrets as chain.py.
require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

// Hardhat default account[1] (AGENT) — public test key, local only.
// Matches the CHAIN_AGENT_KEY default used by backend/src/var/chain.py.
const DEFAULT_AGENT_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const PORT = process.env.SIDECAR_PORT || 8787;
const CHAIN_RPC_URL = process.env.CHAIN_RPC_URL || "http://127.0.0.1:8545";
const CHAIN_AGENT_KEY = process.env.CHAIN_AGENT_KEY || DEFAULT_AGENT_KEY;
const DYNAMIC_ENVIRONMENT_ID = process.env.DYNAMIC_ENVIRONMENT_ID || "";
const DYNAMIC_API_TOKEN = process.env.DYNAMIC_API_TOKEN || "";
const DYNAMIC_WALLET_ID = process.env.DYNAMIC_WALLET_ID || "";

// ---------------------------------------------------------------------------
// Dynamic import (optional dependency). Wrapped in try/catch so the server
// runs even when @dynamic-labs-wallet/node-evm is not installed.
// ---------------------------------------------------------------------------
let dynamicModule = null;
let dynamicLoadError = null;
try {
  // eslint-disable-next-line global-require
  dynamicModule = require("@dynamic-labs-wallet/node-evm");
} catch (err) {
  dynamicLoadError = err && err.message ? err.message : String(err);
  console.warn(
    `[sidecar] Dynamic package not available (${dynamicLoadError}); ` +
      "local ethers signing will be used."
  );
}

const dynamicConfigured = Boolean(
  DYNAMIC_ENVIRONMENT_ID && DYNAMIC_API_TOKEN
);

/**
 * Attempt to sign a transaction via Dynamic's delegated (TSS-MPC) signing.
 * Returns the signed raw transaction string, or throws if unavailable.
 *
 * The exact client surface of @dynamic-labs-wallet/node-evm is probed
 * defensively because the package may not be installed in the local MVP.
 */
async function signWithDynamic(transaction) {
  if (!dynamicModule) {
    throw new Error("Dynamic package not installed");
  }
  if (!dynamicConfigured) {
    throw new Error("DYNAMIC_ENVIRONMENT_ID / DYNAMIC_API_TOKEN not set");
  }

  // Resolve a client constructor across plausible export shapes.
  const ClientCtor =
    dynamicModule.EvmWalletClient ||
    dynamicModule.NodeEvmWalletClient ||
    dynamicModule.WalletClient ||
    dynamicModule.default;

  if (typeof ClientCtor !== "function") {
    throw new Error("Dynamic client constructor not found in package exports");
  }

  const client = new ClientCtor({
    environmentId: DYNAMIC_ENVIRONMENT_ID,
    authToken: DYNAMIC_API_TOKEN,
    apiToken: DYNAMIC_API_TOKEN,
  });

  if (typeof client.delegatedSignTransaction !== "function") {
    throw new Error("delegatedSignTransaction not available on Dynamic client");
  }

  const result = await client.delegatedSignTransaction({
    walletId: DYNAMIC_WALLET_ID || undefined,
    transaction,
  });

  // Normalize across possible return shapes.
  const signed =
    (result && (result.signedTransaction || result.rawTransaction || result.signature)) ||
    result;

  if (typeof signed !== "string" || signed.length === 0) {
    throw new Error("Dynamic returned an empty signed transaction");
  }
  return signed;
}

/**
 * Local fallback: sign with an ethers Wallet built from CHAIN_AGENT_KEY.
 * Populates nonce / gas / chainId from the RPC when the caller omits them,
 * so a bare { to, value, data } request still produces a broadcastable tx.
 */
async function signWithLocalWallet(transaction) {
  const provider = new ethers.JsonRpcProvider(CHAIN_RPC_URL);
  const wallet = new ethers.Wallet(CHAIN_AGENT_KEY, provider);

  const tx = { ...transaction };

  // ethers v6 wants bigint-ish values; pass through strings/numbers as given.
  if (tx.from) delete tx.from; // ethers infers `from` from the wallet.

  // populateTransaction fills nonce, gas, chainId, fee data as needed.
  const populated = await wallet.populateTransaction(tx);
  const signed = await wallet.signTransaction(populated);
  return signed;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "var-sidecar",
    signer: dynamicModule && dynamicConfigured ? "dynamic" : "local",
    dynamicAvailable: Boolean(dynamicModule),
    dynamicConfigured,
    chainRpcUrl: CHAIN_RPC_URL,
  });
});

app.post("/sign-transaction", async (req, res) => {
  const transaction = req.body && req.body.transaction;
  if (!transaction || typeof transaction !== "object") {
    return res
      .status(400)
      .json({ ok: false, error: "Missing 'transaction' object in request body" });
  }

  // 1) Try Dynamic delegated (TSS-MPC) signing.
  try {
    const signedTransaction = await signWithDynamic(transaction);
    return res.json({
      ok: true,
      signer: "dynamic",
      signedTransaction,
    });
  } catch (dynamicErr) {
    const reason = dynamicErr && dynamicErr.message ? dynamicErr.message : String(dynamicErr);
    console.warn(`[sidecar] Dynamic signing unavailable, falling back to local: ${reason}`);

    // 2) Fall back to local ethers signing so the demo always runs.
    try {
      const signedTransaction = await signWithLocalWallet(transaction);
      return res.json({
        ok: true,
        signer: "local",
        fallbackReason: reason,
        signedTransaction,
      });
    } catch (localErr) {
      const localReason =
        localErr && localErr.message ? localErr.message : String(localErr);
      console.error(`[sidecar] Local signing failed: ${localReason}`);
      return res.status(500).json({
        ok: false,
        error: "Both Dynamic and local signing failed",
        dynamicError: reason,
        localError: localReason,
      });
    }
  }
});

app.listen(PORT, () => {
  const mode = dynamicModule && dynamicConfigured ? "dynamic (with local fallback)" : "local";
  console.log(`[sidecar] VAR signer listening on http://127.0.0.1:${PORT}`);
  console.log(`[sidecar] signing mode: ${mode}`);
  console.log(`[sidecar] chain RPC: ${CHAIN_RPC_URL}`);
});
