import { useEffect, useState } from 'react'

export type Trailer = { id: string; site: 'youtube' | 'dailymotion' }

export type Card = {
  id: number
  title: string
  native?: string | null
  romaji?: string | null
  start?: string | null
  status?: string | null
  episodes?: number | null
  format?: string | null
  score?: number | null
  genres: string[]
  poster?: string | null
  color?: string | null
  banner?: string | null
  synopsis?: string | null
  synopsisSource?: string | null
  trailer?: Trailer | null
  nextEpisode?: number | null
  nextAiring?: number | null
}

export type Detail = Card & {
  end?: string | null
  studio?: string | null
  links: { site: string; url: string; note?: string | null; color?: string | null }[]
  cast: { name: string; role: string; image?: string | null; actor?: string | null; actorImage?: string | null }[]
  related: { relation: string; anime: Card }[]
  recommended: Card[]
}

export type Row = { title: string; items: Card[] }
export type Airing = { episode: number; at: number; anime: Card }
export type Watch = { name: string; year?: string | null; stream: Provider[]; buy: Provider[]; link?: string | null }
export type Provider = { name: string; logo?: string | null }

export function countdown(at: number, now = Date.now() / 1000) {
  const s = at - now
  if (s <= 60) return s > -1800 ? 'airing now' : 'aired'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return 'in ' + (d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`)
}

export function region() {
  try { return new Intl.Locale(navigator.language).maximize().region ?? 'US' } catch { return 'US' }
}

export function regionName(r: string) {
  try { return new Intl.DisplayNames([navigator.language], { type: 'region' }).of(r) ?? r } catch { return r }
}

type Answer<T> = { data: T; stale: boolean }

const memo = new Map<string, Promise<Answer<unknown>>>()

function get<T>(path: string): Promise<Answer<T>> {
  let p = memo.get(path) as Promise<Answer<T>> | undefined
  if (!p) {
    p = fetch(path).then(async r => {
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error ?? `The server answered ${r.status}`)
      return { data: body as T, stale: r.headers.get('x-stale') === '1' }
    })
    p.catch(() => memo.delete(path))
    memo.set(path, p)
  }
  return p
}

export function useApi<T>(path: string | null) {
  const [state, set] = useState<{ path: string | null; data?: T; stale?: boolean; error?: string }>({ path: null })
  useEffect(() => {
    if (!path) return
    let live = true
    get<T>(path).then(a => live && set({ path, data: a.data, stale: a.stale }), e => live && set({ path, error: String(e.message ?? e) }))
    return () => { live = false }
  }, [path])
  const current = state.path === path
  return { data: current ? state.data : undefined, stale: current && !!state.stale, error: current ? state.error : undefined, loading: !!path && !current }
}

export function facts(a: Card) {
  return [a.start?.slice(0, 4), a.format, a.episodes && a.format !== 'Movie' ? `${a.episodes} episode${a.episodes === 1 ? '' : 's'}` : null, a.status].filter(Boolean).join('  ·  ')
}

export function prettyDate(s?: string | null) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!m) return String(y)
  return new Date(y, m - 1, d || 1).toLocaleDateString(undefined, d ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'short', year: 'numeric' })
}
