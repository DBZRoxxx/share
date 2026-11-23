import {
  cleanRoomName,
  createRoomId,
  DISPLAY_NAME_MAX,
  parseRoomInput,
  ROOM_NAME_MAX,
  ROOM_PASSWORD_MAX,
  ROOM_PASSWORD_MIN,
  type RoomSummary,
} from '@share/shared'
import { ArrowRight, Check, Eye, EyeOff, Link2, Lock, Plus, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Field, Input, Switch, Tooltip } from '@/components/ui/primitives'
import { roomApi } from '@/lib/chat-api'
import { copyInvite } from '@/lib/invite'
import { cn, hueFor, relativeTime, versionLabel } from '@/lib/utils'
import { useNav } from '@/stores/nav'
import { usePrefs, type RecentRoom } from '@/stores/prefs'

/** How often the rooms list refreshes who is in each room. */
const PRESENCE_INTERVAL_MS = 15_000

export function HomeScreen() {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.share.app.info().then((i) => setVersion(versionLabel(i)))
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="flex-1 overflow-y-auto">
        <div className="animate-fade-in mx-auto flex w-full max-w-[1200px] flex-wrap items-start gap-8 px-8 py-10">
          <QuickCreate />
          <RoomsPanel />
        </div>
        {version && <p className="text-muted/70 pb-6 text-center text-xs">Share v{version}</p>}
      </main>
    </div>
  )
}

/** "Bora compartilhar a tela?": create a room (optionally private) or join by invite. */
function QuickCreate() {
  const { name, set } = usePrefs()
  const goPrejoin = useNav((s) => s.goPrejoin)
  const [draftName, setDraftName] = useState(name)
  const [nameError, setNameError] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [joinInput, setJoinInput] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

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

  const create = (e: FormEvent) => {
    e.preventDefault()
    if (!ensureName()) return
    if (isPrivate) {
      if (password.length < ROOM_PASSWORD_MIN) {
        setPasswordError(`A senha precisa de pelo menos ${ROOM_PASSWORD_MIN} caracteres.`)
        return
      }
      if (password !== confirm) {
        setPasswordError('As senhas não conferem.')
        return
      }
    }
    goPrejoin(createRoomId(), {
      create: {
        name: cleanRoomName(roomName) || undefined,
        password: isPrivate ? password : undefined,
      },
    })
  }

  const join = (e: FormEvent) => {
    e.preventDefault()
    const id = parseRoomInput(joinInput)
    if (!id) {
      setJoinError('Cole o link de convite que te mandaram.')
      return
    }
    if (!ensureName()) return
    goPrejoin(id)
  }

  const matches = !!confirm && password === confirm

  return (
    <section
      aria-labelledby="quick-title"
      className="flex w-full max-w-[400px] flex-[1_1_340px] flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <h1 id="quick-title" className="text-2xl font-bold tracking-tight">
          Bora compartilhar a tela?
        </h1>
        <p className="text-muted text-sm">
          Crie uma sala e mande o link para a galera, ou entre com um convite.
        </p>
      </div>

      <div className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-6 shadow-xl">
        <form onSubmit={create} className="flex flex-col gap-5">
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
              className={nameError ? 'border-danger focus:border-danger focus:ring-danger/30' : ''}
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

          <div
            className={cn(
              'flex flex-col gap-4 rounded-2xl border transition-colors',
              isPrivate ? 'border-accent/50 bg-accent/[0.08] p-4' : 'border-transparent',
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl',
                  isPrivate ? 'bg-accent/20 text-accent-hover' : 'bg-surface-2 text-muted',
                )}
              >
                <Lock className="size-4" aria-hidden="true" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Sala privada</p>
                <p className="text-muted text-xs">Só entra quem souber a senha.</p>
              </div>
              <Switch
                checked={isPrivate}
                aria-label="Sala privada"
                onCheckedChange={(v) => {
                  setIsPrivate(v)
                  setPasswordError(null)
                }}
              />
            </div>
            {isPrivate && (
              <>
                <Field label="Senha">
                  <div className="bg-surface-2 border-border focus-within:border-accent flex h-10 items-center rounded-xl border pr-1 pl-3">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      maxLength={ROOM_PASSWORD_MAX}
                      aria-label="Senha"
                      placeholder={`Mínimo de ${ROOM_PASSWORD_MIN} caracteres`}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setPasswordError(null)
                      }}
                      className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-muted hover:bg-surface-3 hover:text-fg flex size-8 items-center justify-center rounded-lg"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Confirmar senha">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    maxLength={ROOM_PASSWORD_MAX}
                    aria-label="Confirmar senha"
                    onChange={(e) => {
                      setConfirm(e.target.value)
                      setPasswordError(null)
                    }}
                  />
                  {passwordError ? (
                    <span className="text-danger text-xs">{passwordError}</span>
                  ) : (
                    matches && (
                      <span className="text-success flex items-center gap-1.5 text-xs">
                        <Check className="size-3.5" /> As senhas conferem
                      </span>
                    )
                  )}
                </Field>
                <p className="text-muted text-xs">
                  Mande a senha junto com o link. Dá para trocar ou tirar a senha depois, de dentro
                  da sala.
                </p>
              </>
            )}
          </div>

          <Button type="submit" variant="primary" size="lg">
            {isPrivate ? <Lock /> : <Plus />} {isPrivate ? 'Criar sala privada' : 'Criar sala'}
          </Button>
        </form>

        <div className="text-muted flex items-center gap-3 text-xs">
          <span className="bg-border h-px flex-1" /> ou entre com um convite
          <span className="bg-border h-px flex-1" />
        </div>

        <form onSubmit={join} className="flex flex-col gap-1.5">
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
    </section>
  )
}

/** Who is in each listed room, refreshed every few seconds; also keeps names fresh. */
function usePresence(ids: string[]): Record<string, RoomSummary> {
  const [data, setData] = useState<Record<string, RoomSummary>>({})
  const key = ids.join(',')
  useEffect(() => {
    const list = key ? key.split(',') : []
    if (!list.length) return
    let alive = true
    const load = () =>
      void roomApi.presence(list).then((rooms) => {
        if (!alive || !rooms) return
        setData(rooms)
        const prefs = usePrefs.getState()
        for (const [id, info] of Object.entries(rooms)) {
          const known = prefs.recentRooms.find((r) => r.id === id)
          if (known && (known.name !== info.name || !!known.private !== info.private)) {
            prefs.updateRecentRoom(id, { name: info.name, private: info.private })
          }
        }
      })
    load()
    const timer = setInterval(load, PRESENCE_INTERVAL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [key])
  return data
}

type Tab = 'created' | 'recent'

function RoomsPanel() {
  const recentRooms = usePrefs((s) => s.recentRooms)
  const created = useMemo(() => recentRooms.filter((r) => r.createdByMe), [recentRooms])
  const [tab, setTab] = useState<Tab>(() => (created.length ? 'created' : 'recent'))
  const presence = usePresence(recentRooms.map((r) => r.id))
  const list = tab === 'created' ? created : recentRooms

  if (!recentRooms.length) {
    return (
      <section
        aria-labelledby="rooms-title"
        className="border-border/80 bg-surface flex min-h-[460px] min-w-0 flex-[999_1_560px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-8 py-12 text-center"
      >
        <span className="bg-surface-2 text-accent-hover flex size-16 items-center justify-center rounded-2xl">
          <Users className="size-7" aria-hidden="true" />
        </span>
        <h2 id="rooms-title" className="text-xl font-bold">
          Suas salas aparecem aqui
        </h2>
        <p className="text-muted max-w-md text-sm leading-relaxed">
          As salas que você criar e as que você entrar ficam listadas aqui, com quantas pessoas
          estão dentro agora. É só clicar para voltar.
        </p>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="rooms-title"
      className="border-border bg-surface flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-2xl border p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="rooms-title" className="flex-1 text-lg font-bold">
          Suas salas
        </h2>
        <span className="text-muted flex items-center gap-1.5 text-xs">
          <span className="bg-success size-1.5 rounded-full" aria-hidden="true" />
          Pessoas atualizadas ao vivo
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Filtrar salas"
        className="bg-surface-2 inline-flex self-start rounded-xl p-1"
      >
        <TabButton
          active={tab === 'created'}
          onClick={() => setTab('created')}
          count={created.length}
        >
          Criadas por você
        </TabButton>
        <TabButton
          active={tab === 'recent'}
          onClick={() => setTab('recent')}
          count={recentRooms.length}
        >
          Recentes
        </TabButton>
      </div>

      {list.length ? (
        <ul
          className="flex flex-col gap-1"
          aria-label={tab === 'created' ? 'Salas criadas por você' : 'Salas recentes'}
        >
          {list.map((r) => (
            <RoomRow key={r.id} room={r} summary={presence[r.id]} />
          ))}
        </ul>
      ) : (
        <p className="text-muted py-10 text-center text-sm">
          Você ainda não criou nenhuma sala neste computador.
        </p>
      )}

      <p className="text-muted text-xs">
        Clique numa sala para entrar. Salas com cadeado pedem a senha só na primeira vez neste
        computador.
      </p>
    </section>
  )
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors',
        active ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
      )}
    >
      {children} <span className="text-muted text-xs">{count}</span>
    </button>
  )
}

function RoomRow({ room, summary }: { room: RecentRoom; summary?: RoomSummary }) {
  const goPrejoin = useNav((s) => s.goPrejoin)
  const name = usePrefs((s) => s.name)
  const removeRecentRoom = usePrefs((s) => s.removeRecentRoom)
  const label = summary?.name ?? room.name ?? null
  const isPrivate = summary?.private ?? room.private ?? false
  const count = summary?.participants ?? null
  const hue = hueFor(room.id)

  const open = () => {
    if (!name.trim()) {
      document.getElementById('nickname')?.focus()
      return
    }
    goPrejoin(room.id)
  }

  return (
    <li className="group hover:bg-surface-2 flex items-center gap-1 rounded-xl pr-1.5 transition-colors">
      <button
        type="button"
        onClick={open}
        className="flex min-w-0 flex-1 items-center gap-3.5 rounded-xl py-2.5 pr-1 pl-2.5 text-left"
        aria-label={`Entrar na sala ${label ?? 'sem nome'}`}
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
          style={{ background: `hsl(${hue} 55% 42%)` }}
          aria-hidden="true"
        >
          {(label ?? 'S').charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate text-[15px] font-semibold', !label && 'text-muted')}>
              {label ?? 'Sala sem nome'}
            </span>
            {isPrivate && (
              <Lock className="text-accent-hover size-3.5 shrink-0" aria-label="Sala privada" />
            )}
          </span>
          <span className="text-muted text-xs">Usada {relativeTime(room.lastJoinedAt)}</span>
        </span>
        {count !== null && (
          <span
            className={cn(
              'flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
              count > 0 ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted',
            )}
          >
            {count > 0 && <span className="bg-success size-1.5 rounded-full" aria-hidden="true" />}
            {count === 0 ? 'Vazia' : `${count} na sala`}
          </span>
        )}
      </button>
      <Tooltip content="Copiar link de convite">
        <button
          type="button"
          aria-label="Copiar link de convite"
          onClick={() => void copyInvite(room.id)}
          className="text-muted hover:bg-surface-3 hover:text-fg flex size-9 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Link2 className="size-4" />
        </button>
      </Tooltip>
      <Tooltip content="Remover da lista">
        <button
          type="button"
          aria-label="Remover da lista"
          onClick={() => removeRecentRoom(room.id)}
          className="text-muted hover:bg-surface-3 hover:text-fg flex size-9 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <X className="size-4" />
        </button>
      </Tooltip>
    </li>
  )
}
