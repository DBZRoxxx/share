import { CHAT_RETENTION_DAYS, type ChatEnvelope, type ChatEvent } from '@share/shared/chat'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * Local copy of each room's chat (IndexedDB), so opening a room shows its
 * messages instantly and nothing typed is lost while offline:
 *   events  every envelope seen (from the server or live), keyed by room + id
 *   outbox  own events the server has not confirmed yet, in send order
 *   files   downloaded images, so they don't download again (LRU, capped)
 */

interface CachedEvent {
  roomId: string
  id: string
  envelope: ChatEnvelope
}

interface OutboxItem {
  roomId: string
  id: string
  order: number
  event: ChatEvent
}

interface CachedFile {
  fileId: string
  blob: Blob
  size: number
  usedAt: number
}

interface RoomInfo {
  roomId: string
  cursor: number
  activeAt: number
}

interface ChatDb extends DBSchema {
  rooms: { key: string; value: RoomInfo }
  events: { key: [string, string]; value: CachedEvent; indexes: { room: string } }
  outbox: { key: [string, string]; value: OutboxItem; indexes: { room: string } }
  files: { key: string; value: CachedFile; indexes: { usedAt: number } }
}

const FILES_MAX_BYTES = 300 * 1024 * 1024
const RETENTION_MS = CHAT_RETENTION_DAYS * 86_400_000

let dbPromise: Promise<IDBPDatabase<ChatDb> | null> | null = null

function db(): Promise<IDBPDatabase<ChatDb> | null> {
  dbPromise ??= openDB<ChatDb>('share-chat', 1, {
    upgrade(d) {
      d.createObjectStore('rooms', { keyPath: 'roomId' })
      d.createObjectStore('events', { keyPath: ['roomId', 'id'] }).createIndex('room', 'roomId')
      d.createObjectStore('outbox', { keyPath: ['roomId', 'id'] }).createIndex('room', 'roomId')
      d.createObjectStore('files', { keyPath: 'fileId' }).createIndex('usedAt', 'usedAt')
    },
  }).catch((error: unknown) => {
    // Private storage unavailable: the chat still works, just without a cache.
    console.warn('[chat-cache] IndexedDB unavailable', error)
    return null
  })
  return dbPromise
}

export async function loadRoom(roomId: string) {
  const d = await db()
  if (!d) return { cursor: 0, envelopes: [] as ChatEnvelope[], outbox: [] as ChatEvent[] }
  const tx = d.transaction(['rooms', 'events', 'outbox'])
  const [info, events, outbox] = await Promise.all([
    tx.objectStore('rooms').get(roomId),
    tx.objectStore('events').index('room').getAll(roomId),
    tx.objectStore('outbox').index('room').getAll(roomId),
  ])
  const envelopes = events
    .map((e) => e.envelope)
    // Server order first; live-only events by time after them.
    .sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity) || a.event.ts - b.event.ts)
  return {
    cursor: info?.cursor ?? 0,
    envelopes,
    outbox: outbox.sort((a, b) => a.order - b.order).map((o) => o.event),
  }
}

export async function saveEnvelopes(roomId: string, envelopes: ChatEnvelope[], cursor?: number) {
  const d = await db()
  if (!d || (!envelopes.length && cursor === undefined)) return
  const tx = d.transaction(['events', 'rooms'], 'readwrite')
  const store = tx.objectStore('events')
  for (const envelope of envelopes) {
    // Never replace a server copy (with seq) by a live one.
    if (envelope.seq === undefined) {
      const existing = await store.get([roomId, envelope.event.id])
      if (existing?.envelope.seq !== undefined) continue
    }
    await store.put({ roomId, id: envelope.event.id, envelope })
  }
  const rooms = tx.objectStore('rooms')
  const info = (await rooms.get(roomId)) ?? { roomId, cursor: 0, activeAt: 0 }
  await rooms.put({
    roomId,
    cursor: cursor !== undefined ? Math.max(info.cursor, cursor) : info.cursor,
    activeAt: Date.now(),
  })
  await tx.done
}

let order = Date.now()

export async function outboxAdd(roomId: string, event: ChatEvent) {
  const d = await db()
  await d?.put('outbox', { roomId, id: event.id, order: order++, event })
}

export async function outboxRemove(roomId: string, ids: string[]) {
  const d = await db()
  if (!d || !ids.length) return
  const tx = d.transaction('outbox', 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete([roomId, id])))
  await tx.done
}

export async function fileGet(fileId: string): Promise<Blob | null> {
  const d = await db()
  const hit = await d?.get('files', fileId)
  if (!d || !hit) return null
  void d.put('files', { ...hit, usedAt: Date.now() })
  return hit.blob
}

export async function filePut(fileId: string, blob: Blob) {
  const d = await db()
  if (!d) return
  await d.put('files', { fileId, blob, size: blob.size, usedAt: Date.now() })
  // Evict least recently used files over the cap.
  const all = await d.getAllFromIndex('files', 'usedAt')
  let total = all.reduce((sum, f) => sum + f.size, 0)
  for (const f of all) {
    if (total <= FILES_MAX_BYTES) break
    await d.delete('files', f.fileId)
    total -= f.size
  }
}

export async function fileDelete(fileId: string) {
  const d = await db()
  await d?.delete('files', fileId)
}

/** Forgets rooms idle for longer than the server keeps them. */
export async function pruneOldRooms(now = Date.now()) {
  const d = await db()
  if (!d) return
  const rooms = await d.getAll('rooms')
  for (const r of rooms) {
    if (now - r.activeAt < RETENTION_MS) continue
    const tx = d.transaction(['rooms', 'events', 'outbox'], 'readwrite')
    for (const store of ['events', 'outbox'] as const) {
      const keys = await tx.objectStore(store).index('room').getAllKeys(r.roomId)
      await Promise.all(keys.map((k) => tx.objectStore(store).delete(k)))
    }
    await tx.objectStore('rooms').delete(r.roomId)
    await tx.done
  }
  const files = await d.getAllFromIndex('files', 'usedAt')
  for (const f of files) if (now - f.usedAt > RETENTION_MS) await d.delete('files', f.fileId)
}
