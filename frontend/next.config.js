/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@agent-stack/core", "@agent-stack/ui"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },
};

module.exports = nextConfig;
