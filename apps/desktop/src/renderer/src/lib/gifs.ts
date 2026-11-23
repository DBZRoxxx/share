import type { ErrorResponse, GifPage } from '@share/shared'
import { usePrefs } from '@/stores/prefs'
import { WEB_URL } from './config'

function clientHeader(): Record<string, string> {
  return { 'X-Share-Client': usePrefs.getState().identity }
}

/** Trending GIFs when `q` is empty, search results otherwise. */
export async function fetchGifs(q: string, page: number, signal?: AbortSignal): Promise<GifPage> {
  const params = new URLSearchParams({ page: String(page) })
  if (q.trim()) params.set('q', q.trim())
  const res = await fetch(`${WEB_URL}/api/gifs?${params}`, { headers: clientHeader(), signal })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null
    throw new Error(body?.error ?? 'Não foi possível carregar os GIFs.')
  }
  return (await res.json()) as GifPage
}

/** Tells the provider a GIF was sent (best effort). */
export async function shareGif(id: string, q: string): Promise<void> {
  await fetch(`${WEB_URL}/api/gifs/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientHeader() },
    body: JSON.stringify({ id, q }),
  }).catch(() => undefined)
}
