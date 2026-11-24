import { z } from 'zod'

/**
 * Music and watch party: everyone plays the same YouTube video in the official
 * embedded player, kept in step over LiveKit. Nothing is downloaded or
 * re-streamed; the room only shares the queue and where playback is.
 *
 * Import it as `@share/shared/music`. Like `./chat`, it stays out of the
 * package index so changing it never touches the desktop app's shell hash.
 */

export const TOPIC_MUSIC = 'share.music'
/** Items kept in a room's queue (already played ones included, for "previous"). */
export const MUSIC_QUEUE_MAX = 200
/** How far (seconds) a player may drift from the room before it seeks back. */
export const MUSIC_DRIFT_MAX_S = 1.5
/** How often the host tells the room where playback is, while playing. */
export const MUSIC_TICK_MS = 5000
export const MUSIC_TITLE_MAX = 200
export const MUSIC_CHANNEL_MAX = 100

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/

/* ------------------------------- Links ---------------------------------- */

export interface YoutubeLink {
  videoId?: string
  listId?: string
  /** `t=` / `start=` in the link, in seconds. */
  startS?: number
}

const YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds. */
function parseStart(value: string | null): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value)) return Number(value)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!m || !(m[1] || m[2] || m[3])) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Reads a YouTube video and/or playlist link. Null when it isn't one. */
export function parseYoutubeLink(input: string): YoutubeLink | null {
  const text = input.trim()
  if (!text || text.length > 2000) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  const params = url.searchParams
  const segments = url.pathname.split('/').filter(Boolean)

  let videoId: string | undefined
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = segments[0]
  } else if (YT_HOSTS.has(host)) {
    if (segments[0] === 'watch') videoId = params.get('v') ?? undefined
    else if (['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? '')) videoId = segments[1]
    else if (segments[0] !== 'playlist') return null
  } else {
    return null
  }

  const link: YoutubeLink = {}
  if (videoId && VIDEO_ID.test(videoId)) link.videoId = videoId
  const list = params.get('list')
  if (list && LIST_ID.test(list)) link.listId = list
  const start = parseStart(params.get('t') ?? params.get('start'))
  if (start !== undefined && link.videoId) link.startS = start
  return link.videoId || link.listId ? link : null
}

export function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/* ------------------------------- Videos --------------------------------- */

export const musicVideoSchema = z.object({
  videoId: z.string().regex(VIDEO_ID),
  title: z.string().max(MUSIC_TITLE_MAX),
  channel: z.string().max(MUSIC_CHANNEL_MAX),
  /** 0 for live streams. */
  durationS: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 3600),
})

export type MusicVideo = z.infer<typeof musicVideoSchema>

/** GET /api/music/[room]/resolve?url= */
export interface MusicResolveResponse {
  items: MusicVideo[]
  /** Videos left out: private, removed or not allowed in other sites. */
  skipped: number
  playlistTitle?: string
}

/* ------------------------------- Room state ----------------------------- */

export const musicModeSchema = z.enum(['audio', 'video'])
export type MusicMode = z.infer<typeof musicModeSchema>

const itemIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
const identitySchema = z.string().min(1).max(64)

export const queueItemSchema = musicVideoSchema.extend({
  id: itemIdSchema,
  mode: musicModeSchema,
  /** Where the video starts the first time it plays (the link's `t=`). */
  startS: z.number().min(0).optional(),
  addedBy: identitySchema,
  addedByName: z.string().max(64),
})

export type QueueItem = z.infer<typeof queueItemSchema>

/** What the room is playing. `queue[index]` is the current item, if any. */
export const musicPlaybackSchema = z.object({
  queue: z.array(queueItemSchema).max(MUSIC_QUEUE_MAX),
  /** Past the end (or 0 on an empty queue) means nothing is playing. */
  index: z.number().int().min(0),
  playing: z.boolean(),
  /** Position of the current item, as the host saw it when sending. */
  positionS: z.number().min(0),
})

export type MusicPlayback = z.infer<typeof musicPlaybackSchema>

const v1 = { v: z.literal(1) }

/** The host's full state; `rev` grows with every change. */
export const musicStateMessageSchema = musicPlaybackSchema.extend({
  ...v1,
  t: z.literal('state'),
  rev: z.number().int().min(0),
  host: identitySchema,
})

/** The host's periodic "still here, at this point" while playing. */
export const musicTickMessageSchema = z.object({
  ...v1,
  t: z.literal('tick'),
  rev: z.number().int().min(0),
  host: identitySchema,
  itemId: itemIdSchema,
  playing: z.boolean(),
  positionS: z.number().min(0),
})

/** Sent on joining: the host answers with its state. */
export const musicHelloMessageSchema = z.object({ ...v1, t: z.literal('hello') })

/**
 * What anyone in the room asks the host to do. `next`/`prev` name the item
 * they were on, so two people skipping at once skip only one song.
 */
export const musicCommandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), items: z.array(queueItemSchema).min(1).max(MUSIC_QUEUE_MAX) }),
  z.object({ op: z.literal('play'), positionS: z.number().min(0).optional() }),
  z.object({ op: z.literal('pause'), positionS: z.number().min(0) }),
  z.object({ op: z.literal('seek'), positionS: z.number().min(0) }),
  z.object({ op: z.literal('next'), from: itemIdSchema }),
  z.object({ op: z.literal('prev'), from: itemIdSchema, positionS: z.number().min(0) }),
  z.object({ op: z.literal('jump'), itemId: itemIdSchema }),
  z.object({ op: z.literal('remove'), itemId: itemIdSchema }),
  z.object({ op: z.literal('clear') }),
])

export type MusicCommand = z.infer<typeof musicCommandSchema>

export const musicCommandMessageSchema = z.object({
  ...v1,
  t: z.literal('cmd'),
  cmd: musicCommandSchema,
})

export const musicMessageSchema = z.discriminatedUnion('t', [
  musicStateMessageSchema,
  musicTickMessageSchema,
  musicHelloMessageSchema,
  musicCommandMessageSchema,
])

export type MusicMessage = z.infer<typeof musicMessageSchema>
export type MusicStateMessage = z.infer<typeof musicStateMessageSchema>
export type MusicTickMessage = z.infer<typeof musicTickMessageSchema>

export function parseMusicMessage(raw: string): MusicMessage | null {
  try {
    const parsed = musicMessageSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The item playing now, if any. */
export function currentItem(p: Pick<MusicPlayback, 'queue' | 'index'>): QueueItem | undefined {
  return p.queue[p.index]
}
