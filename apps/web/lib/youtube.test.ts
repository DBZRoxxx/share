import { describe, expect, it } from 'vitest'
import { normalizeVideo, parseIsoDuration, resolveLink } from './youtube'

const raw = (id: string, extra: object = {}) => ({
  id,
  snippet: { title: `Title ${id}`, channelTitle: 'Channel', liveBroadcastContent: 'none' },
  contentDetails: { duration: 'PT3M30S' },
  status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' },
  ...extra,
})

const ids = (n: number) => Array.from({ length: n }, (_, i) => `vid${String(i).padStart(8, '0')}`)

/** Fake API answering from a playlist and a set of videos. */
function fakeApi(playlist: string[] | null, videos: Record<string, object>) {
  const calls: string[] = []
  const fetchFn = (async (input: string | URL) => {
    const url = new URL(String(input))
    calls.push(url.pathname.split('/').pop()!)
    const p = url.searchParams
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
    switch (url.pathname.split('/').pop()) {
      case 'playlists':
        return playlist ? json({ items: [{ snippet: { title: 'My list' } }] }) : json({ items: [] })
      case 'playlistItems': {
        if (!playlist) return json({}, 404)
        const start = Number(p.get('pageToken') ?? 0)
        const page = playlist.slice(start, start + 50)
        return json({
          items: page.map((videoId) => ({ contentDetails: { videoId } })),
          nextPageToken: start + 50 < playlist.length ? String(start + 50) : undefined,
        })
      }
      case 'videos':
        return json({
          items: p
            .get('id')!
            .split(',')
            .flatMap((id) => (videos[id] ? [videos[id]] : [])),
        })
      default:
        return json({}, 400)
    }
  }) as typeof fetch
  return { fetchFn, calls }
}

describe('parseIsoDuration', () => {
  it('reads ISO-8601 durations', () => {
    expect(parseIsoDuration('PT3M30S')).toBe(210)
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723)
    expect(parseIsoDuration('P1DT1S')).toBe(86401)
    expect(parseIsoDuration('P0D')).toBe(0)
    expect(parseIsoDuration('nope')).toBe(0)
    expect(parseIsoDuration(undefined)).toBe(0)
  })
})

describe('normalizeVideo', () => {
  it('keeps playable videos', () => {
    expect(normalizeVideo(raw('abcdefghijk'))).toEqual({
      videoId: 'abcdefghijk',
      title: 'Title abcdefghijk',
      channel: 'Channel',
      durationS: 210,
    })
  })

  it('drops videos the embedded player cannot play', () => {
    expect(normalizeVideo(raw('a', { status: { embeddable: false } }))).toBeNull()
    expect(normalizeVideo(raw('a', { status: { privacyStatus: 'private' } }))).toBeNull()
    expect(
      normalizeVideo(raw('a', { snippet: { title: 'x', liveBroadcastContent: 'upcoming' } })),
    ).toBeNull()
  })
})

describe('resolveLink', () => {
  it('resolves a single video', async () => {
    const { fetchFn } = fakeApi(null, { abcdefghijk: raw('abcdefghijk') })
    const res = await resolveLink('key', { videoId: 'abcdefghijk' }, fetchFn)
    expect(res.items.map((v) => v.videoId)).toEqual(['abcdefghijk'])
    expect(res.skipped).toBe(0)
  })

  it('reads every page of a playlist, keeps order and counts what was left out', async () => {
    const list = ids(120)
    const videos = Object.fromEntries(list.map((id) => [id, raw(id)]))
    videos[list[5]!] = raw(list[5]!, { status: { embeddable: false } })
    delete videos[list[7]!]
    const { fetchFn, calls } = fakeApi(list, videos)
    const res = await resolveLink('key', { listId: 'PLx' }, fetchFn)
    expect(res.playlistTitle).toBe('My list')
    expect(res.items).toHaveLength(118)
    expect(res.skipped).toBe(2)
    expect(res.items[0]!.videoId).toBe(list[0])
    expect(res.items[5]!.videoId).toBe(list[6])
    expect(calls.filter((c) => c === 'playlistItems')).toHaveLength(3)
    expect(calls.filter((c) => c === 'videos')).toHaveLength(3)
  })

  it('stops at the queue limit', async () => {
    const list = ids(450)
    const { fetchFn } = fakeApi(list, Object.fromEntries(list.map((id) => [id, raw(id)])))
    const res = await resolveLink('key', { listId: 'PLx' }, fetchFn)
    expect(res.items).toHaveLength(200)
  })

  it('starts a playlist at the linked video', async () => {
    const list = ids(10)
    const { fetchFn } = fakeApi(list, Object.fromEntries(list.map((id) => [id, raw(id)])))
    const res = await resolveLink('key', { listId: 'PLx', videoId: list[4] }, fetchFn)
    expect(res.items.map((v) => v.videoId)).toEqual(list.slice(4))
  })

  it('falls back to the video when the playlist is a mix the API cannot list', async () => {
    const { fetchFn } = fakeApi(null, { abcdefghijk: raw('abcdefghijk') })
    const res = await resolveLink('key', { listId: 'RDabc', videoId: 'abcdefghijk' }, fetchFn)
    expect(res.items.map((v) => v.videoId)).toEqual(['abcdefghijk'])
    expect(res.playlistTitle).toBeUndefined()
  })
})
