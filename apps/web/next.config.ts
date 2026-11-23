import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@share/shared'],
  poweredByHeader: false,
}

export default nextConfig
