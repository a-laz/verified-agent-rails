// Live reads of the DelegationMirror on Arc for the VAR dashboard. Replaces the
// cj branch's Python "box" backend: the widgets read these shapes directly off
// chain via viem, using the shared ABI, addresses, reason codes, and USDC
// helpers (single source of truth in @var/shared).
import { createPublicClient, http, zeroAddress, type Address, type Hex } from "viem";
import {
  arcTestnet,
  ADDRESSES,
  DELEGATION_MIRROR_ADDRESS,
  DelegationMirrorAbi,
  GatedUSDAbi,
  decodeReason,
  formatUSDC,
  parseUSDC,
} from "@var/shared";

// The registered demo agent. Override with NEXT_PUBLIC_AGENT_ADDRESS.
export const DEFAULT_AGENT: Address =
  (process.env.NEXT_PUBLIC_AGENT_ADDRESS as Address | undefined) ??
  "0x69e170Dd3B22f7C68cDDc31fb402b20f50eDcC54";

export const MIRROR: Address = DELEGATION_MIRROR_ADDRESS;
export const GUSD: Address = ADDRESSES.GatedUSD.address;

export const arcPublic = createPublicClient({ chain: arcTestnet, transport: http() });

export function shortAddr(addr?: string): string {
  if (!addr) return "-";
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export interface MandateView {
  exists: boolean;
  agent: Address;
  human: Address; // principal
  spendCap: string; // per-tx cap, formatted gUSD
  asset: Address; // allowedToken
  expiry: number; // unix seconds
  revoked: boolean;
  active: boolean;
  nonce: string;
}

export async function readMandate(agent: Address): Promise<MandateView> {
  const [m, registered] = await Promise.all([
    arcPublic.readContract({
      address: MIRROR,
      abi: DelegationMirrorAbi,
      functionName: "getMandate",
      args: [agent],
    }),
    arcPublic.readContract({
      address: MIRROR,
      abi: DelegationMirrorAbi,
      functionName: "isRegistered",
      args: [agent],
    }),
  ]);
  const now = Math.floor(Date.now() / 1000);
  const expiry = Number(m.expiry);
  const exists = m.principal !== zeroAddress;
  return {
    exists,
    agent,
    human: m.principal,
    spendCap: formatUSDC(m.spendCapPerTx),
    asset: m.allowedToken,
    expiry,
    revoked: m.revoked,
    active: registered && !m.revoked && expiry > now,
    nonce: m.nonce.toString(),
  };
}

// The agent's spendable balances on Arc: native USDC (gas) and gUSD (budget).
// Used by fund-on-grant to decide what to top up.
export async function readAgentFunds(agent: Address): Promise<{ native: bigint; gusd: bigint }> {
  const [native, gusd] = await Promise.all([
    arcPublic.getBalance({ address: agent }),
    arcPublic.readContract({ address: GUSD, abi: GatedUSDAbi, functionName: "balanceOf", args: [agent] }),
  ]);
  return { native, gusd };
}

export interface StatusView {
  ok: boolean;
  reason: string; // decoded bytes32 reason code, e.g. "OK" or "OVER_CAP"
  amount: string; // the gUSD amount that was checked
}

// The mirror's own hot-path gate: would this agent be allowed to move `amount`
// of gUSD right now? Pure view, never reverts.
export async function readEligibility(agent: Address, amount: string): Promise<StatusView> {
  const amt = parseUSDC(amount && amount !== "" ? amount : "0");
  const [ok, reason] = await arcPublic.readContract({
    address: MIRROR,
    abi: DelegationMirrorAbi,
    functionName: "checkTransfer",
    args: [agent, GUSD, amt],
  });
  return { ok, reason: decodeReason(reason), amount };
}

export interface FeedEntry {
  action: "grant" | "revoke";
  ok: boolean;
  label: string;
  detail: string;
  txHash: Hex;
  block: bigint;
  ts: number;
}

// The Arc testnet RPC caps eth_getLogs to a 10,000-block range, so a single
// deployBlock->latest query fails once the chain advances past that window.
// Page the scan in safe chunks and merge.
const LOG_CHUNK = 9_000n;

// Tx feed straight from mirror events for this agent: AttestationSubmitted (a
// mandate was granted) and Revoked (a principal pulled the leash).
export async function readFeed(agent: Address, limit = 20): Promise<FeedEntry[]> {
  const fromBlock = BigInt(ADDRESSES.DelegationMirror.deployBlock);
  const latest = await arcPublic.getBlockNumber();
  const ranges: Array<readonly [bigint, bigint]> = [];
  for (let start = fromBlock; start <= latest; start += LOG_CHUNK + 1n) {
    const end = start + LOG_CHUNK > latest ? latest : start + LOG_CHUNK;
    ranges.push([start, end]);
  }

  const [grantedChunks, revokedChunks] = await Promise.all([
    Promise.all(
      ranges.map(([s, e]) =>
        arcPublic.getContractEvents({
          address: MIRROR,
          abi: DelegationMirrorAbi,
          eventName: "AttestationSubmitted",
          args: { agent },
          fromBlock: s,
          toBlock: e,
        }),
      ),
    ),
    Promise.all(
      ranges.map(([s, e]) =>
        arcPublic.getContractEvents({
          address: MIRROR,
          abi: DelegationMirrorAbi,
          eventName: "Revoked",
          args: { agent },
          fromBlock: s,
          toBlock: e,
        }),
      ),
    ),
  ]);
  const granted = grantedChunks.flat();
  const revoked = revokedChunks.flat();

  const grantEntries: FeedEntry[] = granted.map((l) => ({
    action: "grant",
    ok: true,
    label: "mandate granted",
    detail: `attestor ${shortAddr(l.args.attestor)} · nonce ${l.args.nonce?.toString() ?? "?"}`,
    txHash: l.transactionHash ?? ("0x" as Hex),
    block: l.blockNumber ?? 0n,
    ts: 0,
  }));
  const revokeEntries: FeedEntry[] = revoked.map((l) => ({
    action: "revoke",
    ok: false,
    label: "mandate revoked",
    detail: `by principal ${shortAddr(l.args.principal)}`,
    txHash: l.transactionHash ?? ("0x" as Hex),
    block: l.blockNumber ?? 0n,
    ts: 0,
  }));

  const entries = [...grantEntries, ...revokeEntries];

  // Resolve block timestamps (few unique blocks) for display.
  const uniqueBlocks = Array.from(new Set(entries.map((e) => e.block.toString())));
  const tsByBlock: Record<string, number> = {};
  await Promise.all(
    uniqueBlocks.map(async (b) => {
      if (b === "0") return;
      const blk = await arcPublic.getBlock({ blockNumber: BigInt(b) });
      tsByBlock[b] = Number(blk.timestamp);
    }),
  );
  for (const e of entries) e.ts = tsByBlock[e.block.toString()] ?? 0;

  // Newest first.
  entries.sort((a, b) => (b.block === a.block ? b.ts - a.ts : Number(b.block - a.block)));
  return entries.slice(0, limit);
}
