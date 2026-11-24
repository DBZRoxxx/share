import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@share/shared'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        // The desktop app embeds this page to play YouTube; the embedded
        // player needs to see where it is (Referer) or it refuses to play.
        source: '/player.html',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600' },
        ],
      },
    ]
  },
}

export default nextConfig
