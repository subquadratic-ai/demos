/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse / mammoth are CommonJS Node libraries used only in API routes.
  // Keep them external so Next doesn't try to bundle them for the server build.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"],
  },
};

export default nextConfig;
