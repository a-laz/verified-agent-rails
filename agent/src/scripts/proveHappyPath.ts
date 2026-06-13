/**
 * LIVE proof of the within-cap happy path on the hardened contracts (Arc 5042002).
 * Not a test. Real on-chain sequence:
 *   0. preconditions: agent gas + gUSD (faucetMint if short)
 *   1. grant a fresh mandate via the real attestor-signed submitAttestation
 *   2. pre-check checkTransfer for an under-cap amount
 *   3. agent (Dynamic MPC wallet) pays the ServiceSink, gated by its mandate
 *   4. confirm statuses, Paid event, balances
 *
 * Run: npx tsx agent/src/scripts/proveHappyPath.ts
 */
import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  zeroHash,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { worldchain } from "viem/chains";
import {
  arcTestnet,
  ADDRESSES,
  ARC_CHAIN_ID,
  DELEGATION_MIRROR_ADDRESS,
  DelegationMirrorAbi,
  GatedUSDAbi,
  ServiceSinkAbi,
  ATTESTATION_PRIMARY_TYPE,
  ATTESTATION_TYPES,
  buildDelegationMirrorDomain,
  decodeReason,
  parseUSDC,
  formatUSDC,
} from "@var/shared";
import { getAgentWallet, loadAgentEnv } from "../agentWallet.js";

const AGENT: Address = "0x69e170Dd3B22f7C68cDDc31fb402b20f50eDcC54";
const PRINCIPAL: Address = "0x54E7B896Fe9a5f6A55551Bb4D15A4f1175891dec"; // deployer, distinct from agent/attestor
const MIRROR: Address = DELEGATION_MIRROR_ADDRESS;
const GUSD: Address = ADDRESSES.GatedUSD.address;
const SINK: Address = ADDRESSES.ServiceSink.address;
const AGENT_BOOK: Address = "0xA23aB2712eA7BBa896930544C7d6636a96b944dA";

const CAP = parseUSDC("10"); // per-tx cap
const PAY = parseUSDC("5"); // under-cap payment
const FUND = parseUSDC("20"); // gUSD to faucetMint if agent is short

const AGENT_BOOK_ABI = [
  { type: "function", name: "lookupHuman", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

function line() {
  console.log("-".repeat(72));
}
async function gusdBal(pub: ReturnType<typeof createPublicClient>, who: Address): Promise<bigint> {
  return pub.readContract({ address: GUSD, abi: GatedUSDAbi, functionName: "balanceOf", args: [who] });
}

async function main() {
  loadAgentEnv();
  const arcRpc = process.env.ARC_TESTNET_RPC_URL ?? arcTestnet.rpcUrls.default.http[0];
  const pub = createPublicClient({ chain: arcTestnet, transport: http(arcRpc) });
  const world = createPublicClient({ chain: worldchain, transport: http(process.env.WORLDCHAIN_RPC_URL) });

  const attestorKey = process.env.ATTESTOR_PRIVATE_KEY as Hex | undefined;
  if (!attestorKey) throw new Error("ATTESTOR_PRIVATE_KEY missing in agent/.env");
  const attestor = privateKeyToAccount(attestorKey);

  const agentWallet = await getAgentWallet({ chainId: 5042002, rpcUrl: arcRpc });
  const agentAccount = agentWallet.account!;
  if (agentAccount.address.toLowerCase() !== AGENT.toLowerCase()) {
    throw new Error(`Recovered agent ${agentAccount.address} != expected ${AGENT}`);
  }

  line();
  console.log("LIVE happy-path proof  |  chainId", ARC_CHAIN_ID, " mirror", MIRROR);
  console.log("agent", AGENT, " attestor", attestor.address, " sink", SINK);
  line();

  // 0. preconditions
  const gas0 = await pub.getBalance({ address: AGENT });
  const agentG0 = await gusdBal(pub, AGENT);
  const sinkG0 = await gusdBal(pub, SINK);
  console.log("PRECONDITION agent native gas :", Number(gas0) / 1e18, "USDC");
  console.log("PRECONDITION agent gUSD       :", formatUSDC(agentG0));
  console.log("PRECONDITION sink  gUSD       :", formatUSDC(sinkG0));
  if (gas0 === 0n) throw new Error("agent has no gas; fund native USDC first");

  if (agentG0 < PAY) {
    console.log(`\nagent gUSD < ${formatUSDC(PAY)}; faucetMint ${formatUSDC(FUND)} to agent...`);
    const h = await agentWallet.writeContract({
      account: agentAccount, chain: arcTestnet, address: GUSD, abi: GatedUSDAbi,
      functionName: "faucetMint", args: [AGENT, FUND],
    });
    const r = await pub.waitForTransactionReceipt({ hash: h });
    console.log(`  faucetMint tx ${h}  status=${r.status}`);
    console.log("  agent gUSD now:", formatUSDC(await gusdBal(pub, AGENT)));
  }

  // 1. grant via real attestor-signed submitAttestation
  line();
  const lastNonce = await pub.readContract({ address: MIRROR, abi: DelegationMirrorAbi, functionName: "lastNonce", args: [AGENT] });
  const nonce = lastNonce + 1n;
  const humanId = await world.readContract({ address: AGENT_BOOK, abi: AGENT_BOOK_ABI, functionName: "lookupHuman", args: [AGENT] });
  if (humanId === 0n) throw new Error("agent not registered on World Chain AgentBook");
  const proofRef = keccak256(toHex(humanId, { size: 32 }));
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 min

  const attestation = {
    agent: AGENT, principal: PRINCIPAL, proofRef, kycRef: zeroHash as Hex,
    spendCapPerTx: CAP, spendCapPerPeriod: CAP * 10n, periodLength: 86400n,
    allowedToken: GUSD, expiry, nonce,
  };
  const sig = await attestor.signTypedData({
    domain: buildDelegationMirrorDomain(MIRROR, ARC_CHAIN_ID),
    types: ATTESTATION_TYPES, primaryType: ATTESTATION_PRIMARY_TYPE, message: attestation,
  });
  console.log(`GRANT  lastNonce=${lastNonce} -> nonce=${nonce}  proofRef=${proofRef}`);
  const grantHash = await agentWallet.writeContract({
    account: agentAccount, chain: arcTestnet, address: MIRROR, abi: DelegationMirrorAbi,
    functionName: "submitAttestation", args: [attestation, sig],
  });
  const grantRcpt = await pub.waitForTransactionReceipt({ hash: grantHash });
  const submitted = parseEventLogs({ abi: DelegationMirrorAbi, logs: grantRcpt.logs, eventName: "AttestationSubmitted" });
  const delegated = parseEventLogs({ abi: DelegationMirrorAbi, logs: grantRcpt.logs, eventName: "Delegated" });
  console.log(`  submitAttestation tx ${grantHash}  status=${grantRcpt.status}`);
  console.log(`  AttestationSubmitted: ${submitted.length ? "YES nonce=" + (submitted[0].args as any).nonce : "MISSING"}`);
  console.log(`  Delegated:            ${delegated.length ? "YES cap=" + formatUSDC((delegated[0].args as any).cap) + " gUSD" : "MISSING"}`);
  if (grantRcpt.status !== "success") throw new Error("grant tx reverted");

  // 2. pre-check
  line();
  const [ok, reasonRaw] = await pub.readContract({ address: MIRROR, abi: DelegationMirrorAbi, functionName: "checkTransfer", args: [AGENT, GUSD, PAY] });
  console.log(`CHECKTRANSFER agent pay ${formatUSDC(PAY)} gUSD -> ok=${ok} reason=${decodeReason(reasonRaw)}`);
  if (!ok) throw new Error(`gate refused before pay: ${decodeReason(reasonRaw)}`);

  // 3. agent pays the ServiceSink (approve + pay so Paid fires), gated
  line();
  try {
    const approveHash = await agentWallet.writeContract({
      account: agentAccount, chain: arcTestnet, address: GUSD, abi: GatedUSDAbi,
      functionName: "approve", args: [SINK, PAY],
    });
    const approveRcpt = await pub.waitForTransactionReceipt({ hash: approveHash });
    console.log(`  approve(sink, ${formatUSDC(PAY)}) tx ${approveHash}  status=${approveRcpt.status}`);

    const payHash = await agentWallet.writeContract({
      account: agentAccount, chain: arcTestnet, address: SINK, abi: ServiceSinkAbi,
      functionName: "pay", args: [PAY],
    });
    const payRcpt = await pub.waitForTransactionReceipt({ hash: payHash });
    const paid = parseEventLogs({ abi: ServiceSinkAbi, logs: payRcpt.logs, eventName: "Paid" });
    console.log(`  ServiceSink.pay(${formatUSDC(PAY)}) tx ${payHash}  status=${payRcpt.status}`);
    console.log(`  Paid event: ${paid.length ? "YES agent=" + (paid[0].args as any).agent + " amount=" + formatUSDC((paid[0].args as any).amount) : "MISSING"}`);
    if (payRcpt.status !== "success") throw new Error("pay tx reverted");
  } catch (e) {
    console.error("PAY REVERTED:", (e as Error).message);
    process.exit(1);
  }

  // 4. confirm balances moved
  line();
  const agentG1 = await gusdBal(pub, AGENT);
  const sinkG1 = await gusdBal(pub, SINK);
  console.log("AFTER agent gUSD:", formatUSDC(agentG1), " (delta", formatUSDC(agentG1 - (agentG0 < PAY ? agentG0 + FUND : agentG0)), ")");
  console.log("AFTER sink  gUSD:", formatUSDC(sinkG1), " (delta +", formatUSDC(sinkG1 - sinkG0), ")");
  const sinkDelta = sinkG1 - sinkG0;
  line();
  if (sinkDelta === PAY) {
    console.log(`PASS: agent paid ${formatUSDC(PAY)} gUSD to the sink through the gate, nonce ${nonce}.`);
  } else {
    console.log(`MISMATCH: sink received ${formatUSDC(sinkDelta)}, expected ${formatUSDC(PAY)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message);
  process.exit(1);
});
