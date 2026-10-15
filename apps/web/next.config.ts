import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { cpus: 1 },
  transpilePackages: ['@image-set/shared'],
};

export default nextConfig;
