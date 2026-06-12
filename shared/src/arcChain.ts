// Per the use-arc skill: Arc Testnet is available by default in viem, a custom
// chain definition is never required. Re-exported here so the rest of the
// codebase keeps importing from @var/shared.
export { arcTestnet } from "viem/chains";

// Native gas on Arc is USDC at 18 decimals over JSON-RPC; the ERC-20 USDC
// interface is 6 decimals at the address below. Same balance, two interfaces.
export const ARC_ERC20_USDC = "0x3600000000000000000000000000000000000000" as const;
