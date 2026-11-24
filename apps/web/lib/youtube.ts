import {
  MUSIC_CHANNEL_MAX,
  MUSIC_QUEUE_MAX,
  MUSIC_TITLE_MAX,
  type MusicResolveResponse,
  type MusicVideo,
  type YoutubeLink,
} from '@share/shared/music'

/**
 * YouTube Data API v3, used only to read titles, durations and playlists.
 * Every call here costs 1 quota unit (10 000 free per day); a full playlist
 * of 200 videos costs about 9.
 */
const API = 'https://www.googleapis.com/youtube/v3'
const PAGE = 50

type FetchFn = typeof fetch

export class YoutubeApiError extends Error {}

async function get<T>(
  key: string,
  path: string,
  params: Record<string, string>,
  fetchFn: FetchFn,
): Promise<T | null> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key })}`
  const res = await fetchFn(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300)
    throw new YoutubeApiError(`YouTube API ${res.status}: ${body}`)
  }
  return (await res.json()) as T
}

/** `PT1H2M3S` / `P1DT2H` → seconds; 0 for live streams (`P0D`) or garbage. */
export function parseIsoDuration(value: string | undefined): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value ?? '')
  if (!m) return 0
  const [, d = 0, h = 0, min = 0, s = 0] = m
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s)
}

interface RawVideo {
  id?: string
  snippet?: { title?: string; channelTitle?: string; liveBroadcastContent?: string }
  contentDetails?: { duration?: string }
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string }
}

/** Null for videos that can't play in the embedded player. */
export function normalizeVideo(raw: RawVideo): MusicVideo | null {
  const { id, snippet, contentDetails, status } = raw
  if (!id || !snippet) return null
  if (status?.embeddable === false || status?.privacyStatus === 'private') return null
  if (status?.uploadStatus && !['processed', 'uploaded'].includes(status.uploadStatus)) return null
  if (snippet.liveBroadcastContent === 'upcoming') return null
  return {
    videoId: id,
    title: (snippet.title ?? '').slice(0, MUSIC_TITLE_MAX) || 'Sem título',
    channel: (snippet.channelTitle ?? '').slice(0, MUSIC_CHANNEL_MAX),
    durationS: Math.min(parseIsoDuration(contentDetails?.duration), 7 * 24 * 3600),
  }
}

/** Details for the given ids, in the same order, without the unplayable ones. */
export async function fetchVideos(
  key: string,
  ids: string[],
  fetchFn: FetchFn = fetch,
): Promise<{ items: MusicVideo[]; skipped: number }> {
  const found = new Map<string, MusicVideo>()
  for (let i = 0; i < ids.length; i += PAGE) {
    const page = await get<{ items?: RawVideo[] }>(
      key,
      'videos',
      { part: 'snippet,contentDetails,status', id: ids.slice(i, i + PAGE).join(',') },
      fetchFn,
    )
    for (const raw of page?.items ?? []) {
      const video = normalizeVideo(raw)
      if (video) found.set(video.videoId, video)
    }
  }
  const items = ids.flatMap((id) => found.get(id) ?? [])
  return { items, skipped: ids.length - items.length }
}

/** Video ids of a playlist, in order (up to the queue limit). Null when not found. */
export async function fetchPlaylist(
  key: string,
  listId: string,
  fetchFn: FetchFn = fetch,
): Promise<{ title?: string; ids: string[] } | null> {
  const [info, ids] = await Promise.all([
    get<{ items?: { snippet?: { title?: string } }[] }>(
      key,
      'playlists',
      { part: 'snippet', id: listId },
      fetchFn,
    ),
    (async () => {
      const ids: string[] = []
      let pageToken: string | undefined
      do {
        const page = await get<{
          items?: { contentDetails?: { videoId?: string } }[]
          nextPageToken?: string
        }>(
          key,
          'playlistItems',
          {
            part: 'contentDetails',
            playlistId: listId,
            maxResults: String(PAGE),
            ...(pageToken ? { pageToken } : {}),
          },
          fetchFn,
        )
        if (!page) return ids.length ? ids : null
        for (const item of page.items ?? []) {
          const id = item.contentDetails?.videoId
          if (id && !ids.includes(id)) ids.push(id)
        }
        pageToken = page.nextPageToken
      } while (pageToken && ids.length < MUSIC_QUEUE_MAX)
      return ids.slice(0, MUSIC_QUEUE_MAX)
    })(),
  ])
  if (!ids) return null
  return { title: info?.items?.[0]?.snippet?.title?.slice(0, MUSIC_TITLE_MAX), ids }
}

/**
 * What a link adds to the queue. A video inside a playlist link plays the
 * playlist from that video on, as YouTube does; auto-generated mixes (which
 * the API can't list) fall back to the video alone.
 */
export async function resolveLink(
  key: string,
  link: YoutubeLink,
  fetchFn: FetchFn = fetch,
): Promise<MusicResolveResponse> {
  if (link.listId) {
    const playlist = await fetchPlaylist(key, link.listId, fetchFn)
    if (playlist?.ids.length) {
      const from = link.videoId ? Math.max(0, playlist.ids.indexOf(link.videoId)) : 0
      const { items, skipped } = await fetchVideos(key, playlist.ids.slice(from), fetchFn)
      return { items, skipped, playlistTitle: playlist.title }
    }
  }
  if (!link.videoId) return { items: [], skipped: 0 }
  return fetchVideos(key, [link.videoId], fetchFn)
}
