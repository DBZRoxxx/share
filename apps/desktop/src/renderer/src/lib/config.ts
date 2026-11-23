/**
 * Base URL of the web app on Vercel (landing page, invite links and the
 * /api/token endpoint). Set VITE_SHARE_WEB_URL in apps/desktop/.env.local for
 * dev, and as a GitHub Actions variable for release builds.
 */
export const WEB_URL: string = (
  import.meta.env.VITE_SHARE_WEB_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')
).replace(/\/+$/, '')
