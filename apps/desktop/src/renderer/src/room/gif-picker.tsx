import type { Gif } from '@share/shared'
import { Loader2, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchGifs } from '@/lib/gifs'

interface Results {
  query: string
  gifs: Gif[]
  next: number | null
  error: string | null
}

const COLUMNS = 2

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Splits gifs into columns of roughly equal height (masonry). */
function toColumns(gifs: Gif[]): Gif[][] {
  const cols: Gif[][] = Array.from({ length: COLUMNS }, () => [])
  const heights = new Array<number>(COLUMNS).fill(0)
  for (const gif of gifs) {
    const i = heights.indexOf(Math.min(...heights))
    cols[i]!.push(gif)
    heights[i]! += gif.height / gif.width
  }
  return cols
}

export function GifPicker({ onPick }: { onPick: (gif: Gif, query: string) => void }) {
  const [input, setInput] = useState('')
  const query = useDebounced(input.trim(), 300)
  const [results, setResults] = useState<Results | null>(null)
  const [loadingPage, setLoadingPage] = useState<number | null>(1)
  const sentinel = useRef<HTMLDivElement>(null)

  const current = results?.query === query ? results : null

  // First page whenever the query changes.
  useEffect(() => {
    const ctrl = new AbortController()
    fetchGifs(query, 1, ctrl.signal)
      .then((page) => setResults({ query, gifs: page.gifs, next: page.next, error: null }))
      .catch((error: unknown) => {
        if (ctrl.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Erro ao carregar GIFs.'
        setResults({ query, gifs: [], next: null, error: message })
      })
      .finally(() => !ctrl.signal.aborted && setLoadingPage(null))
    return () => ctrl.abort()
  }, [query])

  // Infinite scroll: load the next page when the sentinel comes into view.
  const next = current?.next ?? null
  useEffect(() => {
    const el = sentinel.current
    if (!el || next === null) return
    let ctrl: AbortController | null = null
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || ctrl) return
      ctrl = new AbortController()
      setLoadingPage(next)
      fetchGifs(query, next, ctrl.signal)
        .then((page) =>
          setResults((r) =>
            r && r.query === query
              ? {
                  ...r,
                  gifs: [...r.gifs, ...page.gifs.filter((g) => !r.gifs.some((x) => x.id === g.id))],
                  next: page.next,
                }
              : r,
          ),
        )
        .catch(() => undefined)
        .finally(() => setLoadingPage(null))
    })
    io.observe(el)
    return () => {
      io.disconnect()
      ctrl?.abort()
    }
  }, [query, next])

  const loading = !current || loadingPage !== null

  return (
    <div className="flex h-[440px] w-[340px] flex-col">
      <div className="p-3 pb-2">
        <label className="border-border bg-surface-2 focus-within:border-accent flex h-9 items-center gap-2 rounded-xl border px-3">
          <Search className="text-muted size-4 shrink-0" aria-hidden="true" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Buscar GIFs"
            aria-label="Buscar GIFs"
            maxLength={100}
            className="placeholder:text-muted w-full bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {current?.error ? (
          <p className="text-muted px-4 py-10 text-center text-sm">{current.error}</p>
        ) : current && current.gifs.length === 0 ? (
          <p className="text-muted px-4 py-10 text-center text-sm">
            Nenhum GIF encontrado para “{query}”.
          </p>
        ) : (
          <div className="flex gap-2">
            {toColumns(current?.gifs ?? []).map((col, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col gap-2">
                {col.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    title={gif.title}
                    onClick={() => onPick(gif, query)}
                    className="bg-surface-2 focus-visible:ring-accent overflow-hidden rounded-lg transition hover:brightness-110 focus-visible:ring-2"
                    style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                  >
                    <img
                      src={gif.preview}
                      alt={gif.title}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="size-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div ref={sentinel} className="h-px" />
        {loading && !current?.error && (
          <div className="flex justify-center py-4">
            <Loader2 className="text-muted size-5 animate-spin" aria-label="Carregando" />
          </div>
        )}
      </div>

      <p className="text-muted border-border border-t px-3 py-1.5 text-right text-[10px] tracking-wide uppercase">
        Powered by KLIPY
      </p>
    </div>
  )
}
