"use client";

import type { ReactNode } from "react";
import { DynamicContextProvider, mergeNetworks } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { arcTestnet } from "@var/shared";

// Dynamic computes balances from eth_getBalance, which on Arc is 18 decimals
// even though the token is USDC. Keep decimals at 18 here or balances render
// off by a trillion.
const arcEvmNetwork = {
  blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
  chainId: arcTestnet.id,
  chainName: arcTestnet.name,
  iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
  name: arcTestnet.name,
  nativeCurrency: {
    name: arcTestnet.nativeCurrency.name,
    symbol: arcTestnet.nativeCurrency.symbol,
    decimals: arcTestnet.nativeCurrency.decimals,
  },
  networkId: arcTestnet.id,
  rpcUrls: [...arcTestnet.rpcUrls.default.http],
  vanityName: "Arc Testnet",
};

const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;

export default function Providers({ children }: { children: ReactNode }) {
  if (!environmentId) {
    return <p>Set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID in web/.env.local</p>;
  }
  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks: (networks) => mergeNetworks([arcEvmNetwork], networks),
        },
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
