/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@var/shared"],
  webpack: (config) => {
    // shared uses NodeNext .js specifiers on .ts sources
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
