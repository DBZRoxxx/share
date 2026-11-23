import {
  cleanRoomName,
  createRoomId,
  DISPLAY_NAME_MAX,
  formatRoomId,
  parseRoomInput,
  ROOM_NAME_MAX,
} from '@share/shared'
import { ArrowRight, Clock, Plus, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Logo } from '@/components/logo'
import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/primitives'
import { relativeTime } from '@/lib/utils'
import { useNav } from '@/stores/nav'
import { usePrefs } from '@/stores/prefs'

export function HomeScreen() {
  const { name, recentRooms, set, removeRecentRoom } = usePrefs()
  const goPrejoin = useNav((s) => s.goPrejoin)
  const [draftName, setDraftName] = useState(name)
  const [roomName, setRoomName] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [nameError, setNameError] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.share.app.info().then((i) => setVersion(i.version))
  }, [])

  const ensureName = (): boolean => {
    const trimmed = draftName.trim()
    if (!trimmed) {
      setNameError(true)
      document.getElementById('nickname')?.focus()
      return false
    }
    if (trimmed !== name) set({ name: trimmed })
    return true
  }

  const createRoom = () => {
    if (!ensureName()) return
    goPrejoin(createRoomId(), cleanRoomName(roomName) || undefined)
  }

  const joinRoom = (e: FormEvent) => {
    e.preventDefault()
    const id = parseRoomInput(joinInput)
    if (!id) {
      setJoinError('Cole o link de convite ou o código da sala (ex.: k7m-q2xp-9tn).')
      return
    }
    if (!ensureName()) return
    goPrejoin(id)
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="flex flex-1 items-center justify-center overflow-y-auto p-8">
        <div className="animate-fade-in w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo className="size-16" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Bora compartilhar a tela?</h1>
            <p className="text-muted mt-1 text-sm">
              Crie uma sala e mande o link para a galera, ou entre com um convite.
            </p>
          </div>

          <div className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-6 shadow-xl">
            <Field
              label="Seu apelido"
              hint={nameError ? undefined : 'É assim que os outros vão te ver.'}
            >
              <Input
                id="nickname"
                value={draftName}
                autoFocus={!name}
                maxLength={DISPLAY_NAME_MAX}
                placeholder="Ex.: Zé do Grave"
                aria-invalid={nameError}
                className={
                  nameError ? 'border-danger focus:border-danger focus:ring-danger/30' : ''
                }
                onChange={(e) => {
                  setDraftName(e.target.value)
                  setNameError(false)
                }}
                onBlur={() => draftName.trim() && set({ name: draftName.trim() })}
              />
              {nameError && (
                <span className="text-danger text-xs">Escolha um apelido para continuar.</span>
              )}
            </Field>

            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                createRoom()
              }}
            >
              <Field label="Nome da sala" hint="Opcional. Dá para mudar depois, dentro da sala.">
                <Input
                  value={roomName}
                  placeholder="Ex.: Noite do CS"
                  aria-label="Nome da sala (opcional)"
                  onChange={(e) => {
                    const value = e.target.value
                    if ([...cleanRoomName(value)].length <= ROOM_NAME_MAX) setRoomName(value)
                  }}
                />
              </Field>
              <Button type="submit" variant="primary" size="lg">
                <Plus /> Criar sala
              </Button>
            </form>

            <div className="text-muted flex items-center gap-3 text-xs">
              <span className="bg-border h-px flex-1" /> ou entre em uma sala{' '}
              <span className="bg-border h-px flex-1" />
            </div>

            <form onSubmit={joinRoom} className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <Input
                  value={joinInput}
                  placeholder="Link de convite ou código"
                  aria-label="Link de convite ou código da sala"
                  aria-invalid={!!joinError}
                  onChange={(e) => {
                    setJoinInput(e.target.value)
                    setJoinError(null)
                  }}
                />
                <Button type="submit" disabled={!joinInput.trim()}>
                  Entrar <ArrowRight />
                </Button>
              </div>
              {joinError && <span className="text-danger text-xs">{joinError}</span>}
            </form>
          </div>

          {recentRooms.length > 0 && (
            <section className="mt-6">
              <h2 className="text-muted mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide uppercase">
                <Clock className="size-3.5" /> Salas recentes
              </h2>
              <ul className="flex flex-col gap-1">
                {recentRooms.map((r) => (
                  <li key={r.id} className="group hover:bg-surface flex items-center rounded-xl">
                    <button
                      type="button"
                      onClick={() => ensureName() && goPrejoin(r.id)}
                      className="flex flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="flex min-w-0 flex-col">
                        {r.name && <span className="truncate text-sm font-medium">{r.name}</span>}
                        <span
                          className={r.name ? 'text-muted font-mono text-xs' : 'font-mono text-sm'}
                        >
                          {formatRoomId(r.id)}
                        </span>
                      </span>
                      <span className="text-muted shrink-0 text-xs">
                        {relativeTime(r.lastJoinedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Remover das recentes"
                      onClick={() => removeRecentRoom(r.id)}
                      className="text-muted hover:bg-surface-2 hover:text-fg mr-2 rounded-lg p-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {version && <p className="text-muted/70 mt-8 text-center text-xs">Share v{version}</p>}
        </div>
      </main>
    </div>
  )
}
