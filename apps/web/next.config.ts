import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Fail builds on type or lint errors; quality gates run them separately too.
  typescript: { ignoreBuildErrors: false },
  // Isolated browser tests must not contend with a developer's running `.next` process.
  distDir: process.env.E2E_ISOLATED_BUILD === '1' ? '.next-e2e' : '.next',
};

export default nextConfig;
