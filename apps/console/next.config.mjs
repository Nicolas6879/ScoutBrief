/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_AGENT_API_URL:
      process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://localhost:3001',
    NEXT_PUBLIC_HASHSCAN_BASE:
      process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet',
  },
}

export default nextConfig
