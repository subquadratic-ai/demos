import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the repo free of generated agent-rule files.
  agentRules: false,
  // The demo is recorded at full screen; keep Next's dev badge out of the shot.
  devIndicators: false,
  // unpdf and mammoth are Node-only; keep them out of the client bundle.
  serverExternalPackages: ["unpdf", "mammoth"],
  // Use case data is read from disk by folder name at runtime, which the tracer cannot follow.
  outputFileTracingIncludes: { "/*": ["./usecases/*/*.json"] },
};

export default nextConfig;
