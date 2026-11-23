import { deepLinkUrl, formatRoomId, normalizeRoomId } from '@share/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DownloadButton } from '@/components/download-button'
import { Logo } from '@/components/logo'
import { getRedis } from '@/lib/chat-db'
import { getLatestRelease } from '@/lib/releases'
import { getRoomName } from '@/lib/room-store'
import { OpenInApp } from './open-in-app'

type Props = { params: Promise<{ roomId: string }> }

async function roomName(roomId: string): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null
  return getRoomName(redis, roomId).catch(() => null)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const roomId = normalizeRoomId(decodeURIComponent((await params).roomId))
  const name = roomId ? await roomName(roomId) : null
  return {
    title: name ? `Convite: ${name}` : 'Convite para uma sala',
    description:
      'Você foi convidado para uma sala no Share. Clique para entrar e ver as telas compartilhadas.',
    robots: { index: false },
  }
}

export default async function RoomInvitePage({ params }: Props) {
  const { roomId: raw } = await params
  const roomId = normalizeRoomId(decodeURIComponent(raw))
  if (!roomId) notFound()

  const [release, name] = await Promise.all([getLatestRelease(), roomName(roomId)])

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="border-border bg-surface w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl shadow-black/40">
        <Logo className="mx-auto size-14" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Você foi convidado para uma sala</h1>
        {name && <p className="mt-3 text-xl font-semibold break-words">{name}</p>}
        <p className="text-muted mt-2 text-sm">
          Código da sala: <span className="text-fg font-mono">{formatRoomId(roomId)}</span>
        </p>

        <OpenInApp deepLink={deepLinkUrl(roomId)} />

        <div className="border-border mt-8 border-t pt-6">
          <p className="text-muted text-sm">Ainda não tem o app?</p>
          <div className="mt-3 flex justify-center">
            <DownloadButton release={release} size="md" />
          </div>
          <p className="text-muted mt-4 text-xs">
            Depois de instalar, volte aqui e clique em{' '}
            <strong className="text-fg">Abrir no app</strong> — ou cole o código acima na tela
            inicial do app.
          </p>
        </div>
      </div>
    </main>
  )
}
