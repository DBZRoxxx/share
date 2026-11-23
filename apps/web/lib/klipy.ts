import { createHash } from 'node:crypto'
import { gifSchema, type Gif, type GifPage } from '@share/shared'
import { clientIp } from './http'

/**
 * KLIPY GIF API (https://docs.klipy.com). The key lives only on the server;
 * the app talks to /api/gifs, which returns a provider-neutral shape.
 */
const BASE = 'https://api.klipy.com/api/v1'
export const GIFS_PER_PAGE = 24

interface KlipyFile {
  url?: string
  width?: number
  height?: number
}

type KlipySize = Partial<Record<'gif' | 'webp' | 'jpg' | 'mp4' | 'webm', KlipyFile>>

interface KlipyItem {
  id?: number | string
  slug?: string
  title?: string
  type?: string
  file?: Partial<Record<'hd' | 'md' | 'sm' | 'xs', KlipySize>>
}

interface KlipyResponse {
  result?: boolean
  data?: { data?: KlipyItem[]; current_page?: number; has_next?: boolean }
}

function pick(size: KlipySize | undefined): KlipyFile | null {
  // Animated WebP is a fraction of the GIF size and Chromium plays it natively.
  const file = size?.webp ?? size?.gif
  return file?.url && file.width && file.height ? file : null
}

export function normalizeKlipy(body: unknown): GifPage {
  const res = body as KlipyResponse
  const items = res?.data?.data ?? []
  const gifs: Gif[] = []
  for (const item of items) {
    if (item.type && item.type !== 'gif') continue // ads and other content types
    const main = pick(item.file?.md) ?? pick(item.file?.hd)
    const preview = pick(item.file?.sm) ?? pick(item.file?.xs) ?? main
    if (!main || !preview || !item.slug) continue
    const parsed = gifSchema.safeParse({
      id: item.slug,
      title: (item.title ?? '').slice(0, 200),
      url: main.url,
      preview: preview.url,
      width: main.width,
      height: main.height,
    })
    if (parsed.success) gifs.push(parsed.data)
  }
  const page = res?.data?.current_page ?? 1
  return { gifs, next: res?.data?.has_next ? page + 1 : null }
}

export function klipyListUrl(
  key: string,
  { q, page, customerId }: { q: string; page: number; customerId: string },
): string {
  const endpoint = q ? 'search' : 'trending'
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(GIFS_PER_PAGE),
    customer_id: customerId,
    locale: 'pt_BR',
    content_filter: 'medium',
  })
  if (q) params.set('q', q)
  return `${BASE}/${encodeURIComponent(key)}/gifs/${endpoint}?${params}`
}

export function klipyShareUrl(key: string, slug: string): string {
  return `${BASE}/${encodeURIComponent(key)}/gifs/share/${encodeURIComponent(slug)}`
}

/** Stable, anonymous per-user id KLIPY uses for recents/personalization. */
export function customerId(request: Request): string {
  const client = request.headers.get('x-share-client') ?? clientIp(request)
  return createHash('sha256').update(`share:${client}`).digest('hex').slice(0, 32)
}
