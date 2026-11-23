import { describe, expect, it } from 'vitest'
import { klipyListUrl, normalizeKlipy } from './klipy'

const file = (w: number, name: string) => ({
  gif: { url: `https://static.klipy.com/ii/x/${name}.gif`, width: w, height: w },
  webp: { url: `https://static.klipy.com/ii/x/${name}.webp`, width: w, height: w },
})

describe('normalizeKlipy', () => {
  it('maps items to the neutral Gif shape, preferring webp', () => {
    const page = normalizeKlipy({
      result: true,
      data: {
        data: [
          {
            id: 1,
            slug: 'hello-hi',
            title: 'Hello',
            type: 'gif',
            file: { md: file(320, 'md'), sm: file(220, 'sm') },
          },
          { id: 2, slug: 'ad-1', type: 'ad' },
          { id: 3, slug: 'broken', type: 'gif', file: {} },
          {
            id: 4,
            slug: 'evil',
            type: 'gif',
            file: { md: { gif: { url: 'https://evil.io/a.gif', width: 1, height: 1 } } },
          },
        ],
        current_page: 2,
        has_next: true,
      },
    })
    expect(page.next).toBe(3)
    expect(page.gifs).toEqual([
      {
        id: 'hello-hi',
        title: 'Hello',
        url: 'https://static.klipy.com/ii/x/md.webp',
        preview: 'https://static.klipy.com/ii/x/sm.webp',
        width: 320,
        height: 320,
      },
    ])
  })

  it('handles empty or malformed responses', () => {
    expect(normalizeKlipy(null)).toEqual({ gifs: [], next: null })
    expect(normalizeKlipy({ data: { data: [], has_next: false } })).toEqual({
      gifs: [],
      next: null,
    })
  })
})

describe('klipyListUrl', () => {
  it('uses trending without a query and search with one', () => {
    expect(klipyListUrl('k', { q: '', page: 1, customerId: 'c' })).toContain('/k/gifs/trending?')
    const url = new URL(klipyListUrl('k', { q: 'gato bravo', page: 2, customerId: 'c' }))
    expect(url.pathname).toBe('/api/v1/k/gifs/search')
    expect(url.searchParams.get('q')).toBe('gato bravo')
    expect(url.searchParams.get('page')).toBe('2')
  })
})
