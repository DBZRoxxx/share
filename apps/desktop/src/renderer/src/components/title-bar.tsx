import { Clock, Download, Loader2, RefreshCw, RotateCw, Zap } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { applyUpdate, checkForUpdates, useUpdate } from '@/stores/update'
import { Button } from './ui/button'
import { Logo } from './logo'
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from './ui/primitives'

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
      <CheckUpdatesButton />
    </header>
  )
}

/** Manual check, for when the app has been sitting in the tray. */
function CheckUpdatesButton() {
  const status = useUpdate((s) => s.status)
  const checking = useUpdate((s) => s.checking)
  // While downloading or ready, the pill next to it says everything.
  if (status.state !== 'idle' && status.state !== 'checking' && status.state !== 'error') {
    return null
  }
  const busy = checking || status.state === 'checking'
  return (
    <Tooltip content={busy ? 'Procurando atualizações…' : 'Verificar atualizações'} side="bottom">
      <button
        type="button"
        aria-label="Verificar atualizações"
        disabled={busy}
        onClick={() => void checkForUpdates()}
        className="no-drag text-muted hover:bg-surface-2 hover:text-fg flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-70"
      >
        <RefreshCw className={cn('size-4', busy && 'animate-spin')} />
      </button>
    </Tooltip>
  )
}

function UpdatePill() {
  const status = useUpdate((s) => s.status)
  const scheduled = useUpdate((s) => s.scheduled)
  const setScheduled = useUpdate((s) => s.setScheduled)
  const inRoom = useUpdate((s) => s.inRoom)
  const [open, setOpen] = useState(false)

  if (status.state === 'downloading') {
    return (
      <span className="text-muted flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        Baixando atualização{status.percent !== null ? ` ${status.percent}%` : '…'}
      </span>
    )
  }
  if (status.state === 'applying') {
    return (
      <span className="text-success flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {status.kind === 'hot' ? 'Atualizando…' : 'Reiniciando…'}
      </span>
    )
  }
  if (status.state !== 'ready') return null

  const hot = status.kind === 'hot'

  // Outside a room there is nothing to lose: apply right away.
  if (!inRoom) {
    return (
      <Tooltip
        content={`Versão ${status.version} pronta. ${hot ? 'Aplica na hora, sem reiniciar.' : 'O app reinicia em segundos.'}`}
        side="bottom"
      >
        <button
          type="button"
          onClick={() => void applyUpdate()}
          className="no-drag bg-success/15 text-success hover:bg-success/25 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
        >
          <Download className="size-3.5" /> Atualizar
        </button>
      </Tooltip>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'no-drag flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
            scheduled
              ? 'bg-surface-2 text-muted hover:text-fg'
              : 'bg-success/15 text-success hover:bg-success/25',
          )}
        >
          {scheduled ? <Clock className="size-3.5" /> : <Download className="size-3.5" />}
          {scheduled ? 'Atualização agendada' : 'Atualizar'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <p className="text-sm font-semibold">Versão {status.version} pronta</p>
        <p className="text-muted mt-1 text-sm">
          {hot
            ? 'Atualização rápida: a tela recarrega e você volta para a sala em ~2 segundos, com câmera, microfone e tela como estavam.'
            : 'O app reinicia para instalar e volta sozinho para a sala em ~10 segundos, com câmera, microfone e tela como estavam.'}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={() => {
              setOpen(false)
              setScheduled(false)
              void applyUpdate()
            }}
          >
            {hot ? <Zap /> : <RotateCw />} Atualizar agora
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setScheduled(!scheduled)
              setOpen(false)
            }}
          >
            <Clock /> {scheduled ? 'Cancelar agendamento' : 'Quando eu sair da sala'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
