import { CHAT_BATCH_MAX, type ChatEnvelope, type ChatEvent } from '@share/shared/chat'
import { RoomEvent, type Room } from 'livekit-client'
import { ChatApiError, chatApi } from '@/lib/chat-api'
import { loadRoom, outboxAdd, outboxRemove, pruneOldRooms, saveEnvelopes } from './chat-cache'
import { useChat } from './chat-store'
import { displayName } from './media-tile'

export const TOPIC_CHAT = 'share.chat'
const PULL_INTERVAL_MS = 45_000
const MAX_BACKOFF_MS = 30_000

/**
 * Local-first chat sync for one room:
 *  - every own action is applied to the UI at once, saved locally, sent live
 *    to the room over LiveKit and queued in an outbox for the server;
 *  - the outbox is flushed in order, retried with backoff, and survives restarts;
 *  - the server log is pulled incrementally on join, on reconnect and
 *    periodically, so nothing sent while away (or by people who left) is missed.
 */
export class ChatSync {
  private cursor = 0
  private outbox: ChatEvent[] = []
  private flushing = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private backoff = 1000
  private pulling: Promise<void> | null = null
  private disposed = false
  private readonly cleanup: (() => void)[] = []

  constructor(
    private readonly room: Room,
    readonly roomId: string,
  ) {}

  /** `seed`: messages carried over from an older app version (resume). */
  async start(seed: ChatEnvelope[] = []) {
    void pruneOldRooms()
    const cached = await loadRoom(this.roomId)
    if (this.disposed) return
    this.cursor = cached.cursor
    // Keep anything sent before the cache finished loading.
    const known = new Set(this.outbox.map((e) => e.id))
    this.outbox = [...cached.outbox.filter((e) => !known.has(e.id)), ...this.outbox]
    const chat = useChat.getState()
    chat.apply([...cached.envelopes, ...seed])
    chat.setUnsynced(
      this.outbox.map((e) => e.id),
      true,
    )
    if (seed.length) void saveEnvelopes(this.roomId, seed)

    const onReconnected = () => this.resync()
    const onOnline = () => this.resync()
    this.room.on(RoomEvent.Reconnected, onReconnected)
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => void this.pull(), PULL_INTERVAL_MS)
    this.cleanup.push(
      () => this.room.off(RoomEvent.Reconnected, onReconnected),
      () => window.removeEventListener('online', onOnline),
      () => clearInterval(timer),
    )
    this.resync()
  }

  dispose() {
    this.disposed = true
    if (this.flushTimer) clearTimeout(this.flushTimer)
    for (const fn of this.cleanup) fn()
  }

  private resync() {
    void this.pull().then(() => this.flush())
  }

  /** An event received live from someone in the room. */
  receiveLive(envelope: ChatEnvelope, unread: boolean): boolean {
    const changed = useChat.getState().apply([envelope], { unread })
    if (changed.length) void saveEnvelopes(this.roomId, [envelope])
    return changed.length > 0
  }

  /** Applies an own event locally, sends it live and queues it for the server. */
  send(event: ChatEvent) {
    const local = this.room.localParticipant
    const envelope: ChatEnvelope = { from: local.identity, fromName: displayName(local), event }
    const chat = useChat.getState()
    chat.apply([envelope])
    chat.setUnsynced([event.id], true)
    void saveEnvelopes(this.roomId, [envelope])
    this.outbox.push(event)
    void outboxAdd(this.roomId, event)
    local
      .sendText(JSON.stringify(event), { topic: TOPIC_CHAT })
      .catch((error: unknown) =>
        console.warn('[chat] live send failed (server will deliver)', error),
      )
    this.scheduleFlush(30)
  }

  private scheduleFlush(delay: number) {
    if (this.disposed || this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, delay)
  }

  private async flush() {
    if (this.flushing || this.disposed || !this.outbox.length) return
    this.flushing = true
    try {
      while (this.outbox.length && !this.disposed) {
        const batch = this.outbox.slice(0, CHAT_BATCH_MAX)
        let done: string[]
        try {
          const res = await chatApi.post(this.roomId, batch)
          for (const r of res.rejected) console.warn('[chat] server rejected', r.id, r.reason)
          done = [...res.accepted, ...res.rejected.map((r) => r.id)]
        } catch (error) {
          if (error instanceof ChatApiError && !error.transient && error.status !== 0) {
            // A request the server will never accept: drop it instead of looping.
            console.error('[chat] dropping batch', error)
            done = batch.map((e) => e.id)
          } else {
            throw error
          }
        }
        const doneSet = new Set(done)
        this.outbox = this.outbox.filter((e) => !doneSet.has(e.id))
        void outboxRemove(this.roomId, done)
        useChat.getState().setUnsynced(done, false)
        // Ids the server ignored (should not happen) would loop forever.
        if (!batch.some((e) => doneSet.has(e.id))) this.outbox = this.outbox.slice(batch.length)
      }
      this.backoff = 1000
    } catch (error) {
      console.warn('[chat] sync failed, retrying', error)
      this.scheduleFlush(this.backoff)
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS)
    } finally {
      this.flushing = false
    }
  }

  /** Fetches what the server has after our cursor. */
  pull(): Promise<void> {
    this.pulling ??= (async () => {
      try {
        for (let page = 0; page < 20 && !this.disposed; page++) {
          const res = await chatApi.events(this.roomId, this.cursor)
          if (this.disposed) return
          if (res.events.length) useChat.getState().apply(res.events)
          void saveEnvelopes(this.roomId, res.events, res.cursor)
          this.cursor = Math.max(this.cursor, res.cursor)
          if (!res.more) break
        }
      } catch (error) {
        console.warn('[chat] pull failed', error)
      } finally {
        this.pulling = null
      }
    })()
    return this.pulling
  }
}
