/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // unpdf / mammoth are Node libraries used only in API routes.
  // Keep them external so Next doesn't try to bundle them for the server build.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
