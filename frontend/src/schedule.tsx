import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { countdown, useApi, type Airing } from './api.ts'
import { useList } from './myList.ts'
import { Hero, ListControls, Notice, SectionTitle } from './ui.tsx'

function useNow() {
  const [now, setNow] = useState(Date.now() / 1000)
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 30_000); return () => clearInterval(t) }, [])
  return now
}

const time = (at: number) => new Date(at * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function Schedule() {
  const from = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000 }, [])
  const { data, stale, error, loading } = useApi<{ items: Airing[] }>(`/api/schedule?from=${from}`)
  const list = useList()
  const now = useNow()
  const [mine, setMine] = useState(() => { try { return localStorage.getItem('otaku.onlyMine') === '1' } catch { return false } })
  const toggle = () => { setMine(!mine); try { localStorage.setItem('otaku.onlyMine', mine ? '0' : '1') } catch { } }
  const all = data?.items ?? []
  const ours = all.filter(a => list[a.anime.id])
  const shown = mine ? ours : all
  const next = ours.find(a => a.at > now) ?? all.find(a => a.at > now && a.anime.banner)
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = from + i * 86400
    return { start, items: shown.filter(a => a.at >= start && a.at < start + 86400) }
  })
  return (
    <>
      {next && (
        <Hero a={next.anime} key={next.anime.id + ':' + next.episode}>
          <div className="kicker">{list[next.anime.id] ? 'Up next from My list' : 'Up next'}</div>
          <h1>{next.anime.title}</h1>
          <div className="facts"><span className="score">Episode {next.episode}</span><span>{countdown(next.at, now)}  ·  {new Date(next.at * 1000).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</span></div>
          <div className="chips"><Link to={`/anime/${next.anime.id}`} state={next.anime} className="chip active">More info</Link><ListControls a={next.anime} /></div>
        </Hero>
      )}
      <main className="page">
        <div className="title-bar">
          <SectionTitle note={data ? `${shown.length} episodes this week` : undefined}>Schedule</SectionTitle>
          <button className={'chip' + (mine ? ' active' : '')} onClick={toggle} title="Only shows on My list">{mine ? '✓ ' : ''}Only My list{ours.length ? ` (${ours.length})` : ''}</button>
        </div>
        <Notice stale={stale} error={error} />
        {mine && data && !ours.length && <p className="quiet">Nothing from My list airs this week. Add shows that are airing to see them here.</p>}
        <div className="week">
          {days.map(({ start, items }, i) => {
            const nowAt = i === 0 ? items.findIndex(a => a.at > now) : -1
            return (
              <section key={start} className="day">
                <h3>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(start * 1000).toLocaleDateString(undefined, { weekday: 'long' })}
                  <small>{new Date(start * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></h3>
                {loading && Array.from({ length: 5 }, (_, n) => <div key={n} className="sk sk-slot" />)}
                {items.map((a, n) => (
                  <div key={a.anime.id + ':' + a.episode}>
                    {n === nowAt && <div className="now-line">Now</div>}
                    <Link to={`/anime/${a.anime.id}`} state={a.anime} className={'slot' + (a.at < now ? ' aired' : '') + (list[a.anime.id] ? ' mine' : '')}>
                      <img src={a.anime.poster ?? ''} alt="" loading="lazy" style={{ background: a.anime.color ?? undefined }} />
                      <div><small>{time(a.at)}</small><strong>{a.anime.title}</strong><small>Episode {a.episode}</small></div>
                    </Link>
                  </div>
                ))}
                {i === 0 && nowAt === -1 && items.length > 0 && <div className="now-line">Now</div>}
                {!loading && !items.length && <p className="quiet small">Nothing airing.</p>}
              </section>
            )
          })}
        </div>
      </main>
    </>
  )
}
