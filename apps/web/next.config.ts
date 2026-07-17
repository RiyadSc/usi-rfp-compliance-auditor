import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Fail builds on type or lint errors; quality gates run them separately too.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
