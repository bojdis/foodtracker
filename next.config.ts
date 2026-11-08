import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;
  const isVercel = Boolean(process.env.VERCEL);

  return {
    reactStrictMode: true,
    // Keep production builds in .next-prod locally so `next build` never overwrites a running `next dev` cache
    distDir: isDevServer || isVercel ? ".next" : ".next-prod",
  };
}
