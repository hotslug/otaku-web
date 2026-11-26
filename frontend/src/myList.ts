import { useSyncExternalStore } from 'react'
import type { Card } from './api.ts'


export const statuses = ['Watching', 'Plan to watch', 'Finished'] as const
export type Status = (typeof statuses)[number]
export type Entry = { anime: Card; status?: Status; favourite?: boolean }
export type List = Record<number, Entry>

const KEY = 'otaku.list'

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

function card(a: Card): Card {
  const { id, title, native, start, status, episodes, format, score, genres, poster, color, banner, nextEpisode, nextAiring } = a
  return { id, title, native, start, status, episodes, format, score, genres, poster, color, banner, nextEpisode, nextAiring }
}

function read(): List {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

let list: List = typeof localStorage === 'undefined' ? {} : read()
const listeners = new Set<() => void>()

function save(next: List) {
  list = next
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { }
  listeners.forEach(f => f())
}

export const setStatus = (a: Card, status: Status | null) => save(apply(list, a, { status }))
export const toggleFavourite = (a: Card) => save(apply(list, a, { favourite: !list[a.id]?.favourite }))

export function useList(): List {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f) }, () => list)
}

if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key === KEY) { list = read(); listeners.forEach(f => f()) } })
