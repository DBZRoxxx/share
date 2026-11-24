import {
  MUSIC_TICK_MS,
  TOPIC_MUSIC,
  currentItem,
  parseMusicMessage,
  type MusicCommand,
  type MusicMessage,
  type MusicPlayback,
} from '@share/shared/music'
import { RoomEvent, type RemoteParticipant, type Room } from 'livekit-client'
import { toast } from 'sonner'
import {
  EMPTY_PLAYBACK,
  acceptsState,
  acceptsTick,
  advance,
  applyCommand,
  electHost,
  lostItems,
} from './music-logic'
import { localPosition, useMusic, type MusicSnapshot, type RoomMusic } from './music-store'

type WithoutVersion<M> = M extends unknown ? Omit<M, 'v'> : never
type Outgoing = WithoutVersion<MusicMessage>

/**
 * Keeps the room's music in step over LiveKit (topic `share.music`).
 *
 * One participant, the host, holds the truth: everyone sends it commands,
 * it applies them and sends the new state to all, plus a tick every few
 * seconds while playing so players can correct their drift. Newcomers say
 * hello and the host answers. When the host leaves, the participant with the
 * smallest identity takes over from its own copy, so the music never stops
 * because one person left.
 */
export class MusicSync {
  private readonly cleanup: (() => void)[] = []
  private disposed = false

  constructor(private readonly room: Room) {}

  private get me() {
    return this.room.localParticipant.identity
  }

  private get state() {
    return useMusic.getState().room
  }

  private isHost(): boolean {
    return this.state?.host === this.me
  }

  start() {
    this.room.registerTextStreamHandler(TOPIC_MUSIC, (reader, { identity }) => {
      void reader.readAll().then((raw) => {
        const msg = parseMusicMessage(raw)
        if (msg && !this.disposed) this.receive(identity, msg)
      })
    })
    const onLeft = (p: RemoteParticipant) => this.onParticipantLeft(p.identity)
    // After a reconnect we may have missed changes: ask again.
    const onReconnected = () => this.send({ t: 'hello' })
    this.room.on(RoomEvent.ParticipantDisconnected, onLeft)
    this.room.on(RoomEvent.Reconnected, onReconnected)
    const timer = setInterval(() => this.tick(), MUSIC_TICK_MS)
    this.cleanup.push(
      () => this.room.unregisterTextStreamHandler(TOPIC_MUSIC),
      () => this.room.off(RoomEvent.ParticipantDisconnected, onLeft),
      () => this.room.off(RoomEvent.Reconnected, onReconnected),
      () => clearInterval(timer),
    )
    this.send({ t: 'hello' })
  }

  dispose() {
    this.disposed = true
    for (const fn of this.cleanup) fn()
  }

  /** Something someone here pressed: the host applies it, everyone else asks the host. */
  command(cmd: MusicCommand) {
    const s = this.state
    if (!s || this.isHost() || !this.room.remoteParticipants.has(s.host)) {
      this.applyAsHost(cmd)
    } else {
      this.send({ t: 'cmd', cmd }, [s.host])
    }
  }

  /**
   * Picks the music back up from where this app left it (before an update or
   * a dropped connection), unless someone in the room already has it.
   */
  restore(snapshot: MusicSnapshot) {
    if (this.disposed || this.state) return
    const playback = advance(snapshot.playback, (Date.now() - snapshot.savedAt) / 1000)
    if (currentItem(playback)) this.publish(playback, 1)
  }

  /** The local player finished `videoId`. */
  ended(videoId: string) {
    this.ensureHost()
    const item = this.state ? currentItem(this.state) : undefined
    if (this.isHost() && item?.videoId === videoId) this.applyAsHost({ op: 'next', from: item.id })
  }

  /** The local player can't play `videoId`: say so, and the host moves on. */
  failed(videoId: string | null, message: string) {
    const item = this.state ? currentItem(this.state) : undefined
    if (!item || (videoId && item.videoId !== videoId)) return
    this.ensureHost()
    toast.error(message, { id: `music-error-${item.id}`, description: item.title })
    if (this.isHost()) this.applyAsHost({ op: 'next', from: item.id })
  }

  private send(msg: Outgoing, to?: string[]) {
    if (this.disposed) return
    if (!to && this.room.remoteParticipants.size === 0) return
    this.room.localParticipant
      .sendText(JSON.stringify({ v: 1, ...msg }), {
        topic: TOPIC_MUSIC,
        ...(to ? { destinationIdentities: to } : {}),
      })
      .catch((error: unknown) => console.warn('[music] send failed', error))
  }

  private stateMessage(s: RoomMusic): Outgoing {
    return {
      t: 'state',
      rev: s.rev,
      host: s.host,
      queue: s.queue,
      index: s.index,
      playing: s.playing,
      positionS: s.positionS,
    }
  }

  private applyAsHost(cmd: MusicCommand) {
    const known = this.state
    const base: RoomMusic = known ?? { ...EMPTY_PLAYBACK, rev: 0, host: this.me }
    const next = applyCommand(base, cmd, localPosition())
    if (next) this.publish(next, base.rev + 1)
  }

  /** Becomes (or stays) host with `playback` and tells the room. */
  private publish(playback: MusicPlayback, rev: number) {
    const s: RoomMusic = { ...playback, rev, host: this.me }
    this.adopt(s)
    this.send(this.stateMessage(s))
  }

  private adopt(s: RoomMusic) {
    const before = this.state
    useMusic.setState((m) => ({ room: s, syncedAt: Date.now(), syncSeq: m.syncSeq + 1 }))
    this.announce(before, s)
  }

  /** "X started the music" when something starts in a quiet room (not for every song). */
  private announce(before: RoomMusic | null, after: RoomMusic) {
    const was = before ? currentItem(before) : undefined
    const now = currentItem(after)
    // Joining a room mid-song isn't news; only a song that just started is.
    if (was || !now || now.addedBy === this.me || after.positionS > 5) return
    toast(
      now.mode === 'video'
        ? `${now.addedByName} abriu uma watch party`
        : `${now.addedByName} começou a tocar música`,
      { description: now.title },
    )
  }

  private receive(sender: string, msg: MusicMessage) {
    const s = this.state
    switch (msg.t) {
      case 'hello':
        if (s && this.isHost()) this.send(this.stateMessage(s), [sender])
        return
      case 'cmd':
        if (!s || this.isHost()) this.applyAsHost(msg.cmd)
        // Sent to us by someone with an old idea of who hosts: pass it on.
        else if (s.host !== sender && this.room.remoteParticipants.has(s.host)) {
          this.send({ t: 'cmd', cmd: msg.cmd }, [s.host])
        } else this.applyAsHost(msg.cmd)
        return
      case 'state': {
        if (!acceptsState(s, msg, sender)) return
        const lost = s && s.host === this.me && msg.host !== this.me ? lostItems(s, msg) : []
        const { t: _t, v: _v, ...next } = msg
        this.adopt(next)
        // Two people started music at once and the other one won: keep ours in their queue.
        if (lost.length) this.send({ t: 'cmd', cmd: { op: 'add', items: lost } }, [msg.host])
        return
      }
      case 'tick':
        if (!s || !acceptsTick(s, msg, sender)) return
        if (currentItem(s)?.id !== msg.itemId) return
        useMusic.setState((m) => ({
          room: { ...s, playing: msg.playing, positionS: msg.positionS },
          syncedAt: Date.now(),
          syncSeq: m.syncSeq + 1,
        }))
        return
    }
  }

  private tick() {
    this.ensureHost()
    const s = this.state
    const item = s ? currentItem(s) : undefined
    if (!s || !item || !s.playing || !this.isHost()) return
    const positionS = localPosition()
    // A player that never reported the end (it didn't load, say) mustn't stall the queue.
    if (item.durationS > 0 && positionS > item.durationS + 5) {
      this.applyAsHost({ op: 'next', from: item.id })
      return
    }
    // Our own position is the reference: no drift check for us.
    useMusic.setState({ room: { ...s, positionS }, syncedAt: Date.now() })
    this.send({ t: 'tick', rev: s.rev, host: s.host, itemId: item.id, playing: true, positionS })
  }

  /**
   * The host is gone but we never heard it leave (say, it left while we were
   * reconnecting): whoever is still here picks up, even if that's only us.
   */
  private ensureHost() {
    const s = this.state
    if (!s || s.host === this.me || this.room.remoteParticipants.has(s.host)) return
    this.onParticipantLeft(s.host)
  }

  private onParticipantLeft(identity: string) {
    const s = this.state
    if (!s || s.host !== identity) return
    const host = electHost([this.me, ...this.room.remoteParticipants.keys()])
    if (host !== this.me) return
    // Carry on from where our own player is.
    this.publish({ ...s, positionS: localPosition() }, s.rev + 1)
  }
}
