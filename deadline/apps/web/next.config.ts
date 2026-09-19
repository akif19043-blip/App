import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship compiled ESM; Next still needs to know they are
  // part of this build so source maps and tree-shaking behave.
  transpilePackages: ['@deadline/shared', '@deadline/game-core', '@deadline/ui'],
  experimental: {
    optimizePackageImports: ['three'],
  },
};

export default nextConfig;
