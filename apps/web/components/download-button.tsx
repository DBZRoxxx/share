import { Download } from 'lucide-react'
import { RELEASES_PAGE, type LatestRelease } from '@/lib/releases'

interface Props {
  release: LatestRelease | null
  size?: 'lg' | 'md'
  showMeta?: boolean
}

export function DownloadButton({ release, size = 'lg', showMeta = true }: Props) {
  const href = release?.downloadUrl ?? RELEASES_PAGE
  const sizing = size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm'
  const meta = release
    ? `Versão ${release.version}${release.sizeMb ? ` · ${release.sizeMb} MB` : ''} · Windows 10/11 64-bit`
    : 'Windows 10/11 64-bit'

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <a
        href={href}
        className={`bg-accent shadow-accent/25 hover:bg-accent-hover focus-visible:ring-accent focus-visible:ring-offset-bg inline-flex items-center gap-2 rounded-xl font-semibold text-white shadow-lg transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${sizing}`}
      >
        <Download className="size-5" aria-hidden="true" />
        Baixar para Windows
      </a>
      {showMeta && <span className="text-muted text-xs">{meta}</span>}
    </div>
  )
}
