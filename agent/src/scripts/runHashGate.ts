/**
 * Standalone runner for the EIP-712 hash gate. Run before anything else:
 *   npm run attest:gate -w @var/agent
 * Exits non-zero on mismatch so it can guard CI and the submit path.
 */
import { printHashGate, runHashGate } from "../attestation/hashGate.js";

const ok = printHashGate(runHashGate());
process.exit(ok ? 0 : 1);
