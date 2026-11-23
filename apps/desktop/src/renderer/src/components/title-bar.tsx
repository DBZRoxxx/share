import type { UpdateStatus } from '@shared/ipc'
import { Download, Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Logo } from './logo'
import { Tooltip } from './ui/primitives'

/**
 * Custom title bar (the native one is hidden; Windows still draws the
 * min/max/close buttons on the right via titleBarOverlay).
 */
export function TitleBar({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        'drag-region titlebar-safe border-border bg-bg flex h-10 shrink-0 items-center gap-3 border-b pl-3',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Logo className="size-5" />
        <span className="text-sm font-semibold tracking-tight">Share</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <UpdatePill />
    </header>
  )
}

function UpdatePill() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => window.share.updater.onStatus(setStatus), [])

  if (status.state === 'downloading' || status.state === 'available') {
    return (
      <span className="text-muted flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        Baixando atualização{status.state === 'downloading' ? ` ${status.percent}%` : '…'}
      </span>
    )
  }
  if (status.state !== 'ready') return null
  return (
    <Tooltip content={`Versão ${status.version} pronta. O app reinicia em segundos.`} side="bottom">
      <button
        type="button"
        onClick={() => void window.share.updater.install()}
        className="no-drag bg-success/15 text-success hover:bg-success/25 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
      >
        <Download className="size-3.5" /> Atualizar e reiniciar
      </button>
    </Tooltip>
  )
}
