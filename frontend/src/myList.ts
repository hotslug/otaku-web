import { useSyncExternalStore } from 'react'
import type { Card } from './api.ts'

// My list lives in the browser: no accounts, nothing on the server.

export const statuses = ['Watching', 'Plan to watch', 'Finished'] as const
export type Status = (typeof statuses)[number]
export type Entry = { anime: Card; status?: Status; favourite?: boolean }
export type List = Record<number, Entry>

const KEY = 'otaku.list'

// Pure, so it can be tested: an entry with no status and no star is dropped.
export function apply(list: List, a: Card, change: { status?: Status | null; favourite?: boolean }): List {
  const old = list[a.id]
  const e: Entry = { anime: card(a), status: old?.status, favourite: old?.favourite }
  if (change.status !== undefined) e.status = change.status ?? undefined
  if (change.favourite !== undefined) e.favourite = change.favourite
  const next = { ...list }
  if (!e.status && !e.favourite) delete next[a.id]
  else next[a.id] = e
  return next
}

// The card without the page-only extras, so storage stays small.
function card(a: Card): Card {
  const { id, title, native, start, status, episodes, format, score, genres, poster, color, banner, nextEpisode, nextAiring } = a
  return { id, title, native, start, status, episodes, format, score, genres, poster, color, banner, nextEpisode, nextAiring }
}

function read(): List {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } // private windows can throw
}

let list: List = typeof localStorage === 'undefined' ? {} : read()
const listeners = new Set<() => void>()

function save(next: List) {
  list = next
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* kept for this visit only */ }
  listeners.forEach(f => f())
}

export const setStatus = (a: Card, status: Status | null) => save(apply(list, a, { status }))
export const toggleFavourite = (a: Card) => save(apply(list, a, { favourite: !list[a.id]?.favourite }))

export function useList(): List {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f) }, () => list)
}

// Another tab changed it.
if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key === KEY) { list = read(); listeners.forEach(f => f()) } })
