/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@var/shared"],
  // The Dynamic MPC SDK is a heavy server-only dependency; keep it out of the
  // bundle and require() it at runtime from node_modules.
  serverExternalPackages: ["@dynamic-labs-wallet/node-evm", "@dynamic-labs-wallet/core"],
  webpack: (config) => {
    // shared uses NodeNext .js specifiers on .ts sources
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
