import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { cpus: 1 },
  transpilePackages: ['@image-set/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? (process.env.NODE_ENV === 'production' ? 'http://api:3001/api' : 'http://localhost:3001/api')}/:path*`,
      },
    ];
  },
};

export default nextConfig;
