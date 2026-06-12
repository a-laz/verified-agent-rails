import { formatUnits, parseUnits } from "viem";

// Arc gotcha: native USDC gas is 18 decimals, ERC-20 USDC is 6. Every ERC-20
// amount in this codebase goes through these helpers. Never call parseUnits
// with user-supplied decimals: parseUnits("1", 18) on an ERC-20 transfer here
// sends a trillion dollars.
export const USDC_DECIMALS = 6;

export function parseUSDC(amount: string): bigint {
  return parseUnits(amount, USDC_DECIMALS);
}

export function formatUSDC(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}
