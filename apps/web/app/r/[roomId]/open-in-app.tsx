'use client'

import { ExternalLink } from 'lucide-react'
import { useEffect } from 'react'

export function OpenInApp({ deepLink }: { deepLink: string }) {
  useEffect(() => {
    // Hand the link to the installed app right away. If it is not installed
    // nothing happens and the user still has the download button below.
    const timer = setTimeout(() => {
      window.location.href = deepLink
    }, 300)
    return () => clearTimeout(timer)
  }, [deepLink])

  return (
    <a
      href={deepLink}
      className="bg-accent hover:bg-accent-hover focus-visible:ring-accent focus-visible:ring-offset-surface mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <ExternalLink className="size-5" aria-hidden="true" />
      Abrir no app
    </a>
  )
}
