import { describe, expect, it } from 'vitest'
import { parseMusicMessage, parseYoutubeLink, type QueueItem } from './music'

const ID = 'dQw4w9WgXcQ'

describe('parseYoutubeLink', () => {
  it('reads video links in their usual shapes', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}`,
      `youtube.com/watch?v=${ID}&feature=share`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}?si=abc`,
      `  https://youtu.be/${ID}?si=xyz  `,
    ]) {
      expect(parseYoutubeLink(url), url).toEqual({ videoId: ID })
    }
  })

  it('reads playlists, alone or with a video', () => {
    expect(parseYoutubeLink('https://www.youtube.com/playlist?list=PL1234abcd')).toEqual({
      listId: 'PL1234abcd',
    })
    expect(parseYoutubeLink(`https://www.youtube.com/watch?v=${ID}&list=PL1234abcd`)).toEqual({
      videoId: ID,
      listId: 'PL1234abcd',
    })
    expect(parseYoutubeLink(`https://music.youtube.com/playlist?list=OLAK5uy_abc`)).toEqual({
      listId: 'OLAK5uy_abc',
    })
  })

  it('reads the start time', () => {
    expect(parseYoutubeLink(`https://youtu.be/${ID}?t=90`)?.startS).toBe(90)
    expect(parseYoutubeLink(`https://youtu.be/${ID}?t=1m30s`)?.startS).toBe(90)
    expect(parseYoutubeLink(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)?.startS).toBe(3723)
    expect(parseYoutubeLink(`https://youtu.be/${ID}?t=abc`)?.startS).toBeUndefined()
  })

  it('rejects everything else', () => {
    for (const url of [
      '',
      'hello',
      `https://vimeo.com/${ID}`,
      `https://youtube.com.evil.com/watch?v=${ID}`,
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/@channel',
      'https://www.youtube.com/',
      `javascript://youtu.be/${ID}`,
    ]) {
      expect(parseYoutubeLink(url), url).toBeNull()
    }
  })
})

describe('parseMusicMessage', () => {
  const item: QueueItem = {
    id: 'item1',
    videoId: ID,
    title: 'Song',
    channel: 'Artist',
    durationS: 213,
    mode: 'audio',
    addedBy: 'me',
    addedByName: 'Me',
  }

  it('accepts valid messages', () => {
    const state = {
      v: 1,
      t: 'state',
      rev: 3,
      host: 'me',
      queue: [item],
      index: 0,
      playing: true,
      positionS: 12.5,
    }
    expect(parseMusicMessage(JSON.stringify(state))).toEqual(state)
    const cmd = { v: 1, t: 'cmd', cmd: { op: 'next', from: 'item1' } }
    expect(parseMusicMessage(JSON.stringify(cmd))).toEqual(cmd)
    expect(parseMusicMessage('{"v":1,"t":"hello"}')).toEqual({ v: 1, t: 'hello' })
  })

  it('rejects malformed ones', () => {
    expect(parseMusicMessage('not json')).toBeNull()
    expect(parseMusicMessage('{"v":2,"t":"hello"}')).toBeNull()
    expect(parseMusicMessage('{"v":1,"t":"cmd","cmd":{"op":"explode"}}')).toBeNull()
    const bad = { v: 1, t: 'cmd', cmd: { op: 'add', items: [{ ...item, videoId: 'x' }] } }
    expect(parseMusicMessage(JSON.stringify(bad))).toBeNull()
  })
})
