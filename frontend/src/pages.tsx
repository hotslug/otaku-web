import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { prettyDate, region, regionName, useApi, type Card, type Detail, type Row as RowData, type Watch } from './api.ts'
import { statuses, useList, type List } from './myList.ts'
import { Carousel, Facts, Grid, Hero, ListControls, Notice, Row, SectionTitle, SkeletonGrid, SkeletonRow, WideRow } from './ui.tsx'

const genres = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery',
  'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller']
const formats = [['TV', 'TV'], ['MOVIE', 'Movie'], ['OVA', 'OVA'], ['ONA', 'ONA'], ['SPECIAL', 'Special'], ['TV_SHORT', 'TV short']]
const statusFilters = [['RELEASING', 'Airing now'], ['FINISHED', 'Finished'], ['NOT_YET_RELEASED', 'Coming soon']]
const sorts = [['POPULARITY_DESC', 'Most popular'], ['SCORE_DESC', 'Best rated'], ['TRENDING_DESC', 'Trending'], ['START_DATE_DESC', 'Newest']]
const seasonNames = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
const seasonIcon: Record<string, string> = { WINTER: '❄︎', SPRING: '✿', SUMMER: '☀︎', FALL: '❦' }
const keys = ['q', 'genre', 'format', 'status', 'sort', 'year', 'season']

export function Discover() {
  const [params] = useSearchParams()
  const searching = keys.some(k => params.get(k))
  const query = new URLSearchParams(keys.flatMap(k => (params.get(k) ? [[k, params.get(k)!]] : []))).toString()
  const home = useApi<{ rows: RowData[] }>(searching ? null : '/api/home')
  const forYou = useForYou(searching)
  const found = useApi<{ items: Card[] }>(searching ? `/api/search?${query}` : null)
  const rows = home.data?.rows ?? []
  const slides = rows[0]?.items.filter(a => a.banner).slice(0, 8).map((a, n) => ({ a, note: `Trending now · #${n + 1}` })) ?? []
  const results = found.data?.items
  const q = params.get('q')
  return (
    <>
      {!searching && <Carousel slides={slides} />}
      {searching && results?.[0] && (
        <Hero a={results[0]} key={results[0].id}>
          <div className="kicker">{q ? 'Top result' : 'Top pick for these filters'}</div>
          <h1>{results[0].title}</h1>
          <Facts a={results[0]} />
          <div className="chips"><Link to={`/anime/${results[0].id}`} state={results[0]} className="chip active">More info</Link><ListControls a={results[0]} /></div>
        </Hero>
      )}
      <main className="page">
        <Filters />
        <Notice stale={home.stale || found.stale} error={home.error ?? found.error} />
        {searching ? (
          found.loading ? <SkeletonGrid /> : results && (
            <>
              <SectionTitle note={results.length ? `${results.length}${results.length === 40 ? '+' : ''} shows` : undefined}>{q ? `Results for “${q}”` : 'Filtered'}</SectionTitle>
              {results.length ? <Grid items={results.slice(1)} /> : <p className="quiet">No anime found. Try fewer filters.</p>}
            </>
          )
        ) : home.loading ? (
          [0, 1, 2].map(n => <SkeletonRow key={n} />)
        ) : (
          [...rows.slice(0, 1), ...forYou, ...rows.slice(1)].map(r => <Row key={r.title} title={r.title} items={r.items} />)
        )}
      </main>
    </>
  )
}

function useForYou(off: boolean): RowData[] {
  const list = useList()
  const [picks] = useState(() => Object.values(list).filter(e => e.favourite).map(e => e.anime.id).sort(() => Math.random() - 0.5).slice(0, 2).sort((x, y) => x - y))
  const { data } = useApi<{ rows: RowData[] }>(off || !picks.length ? null : `/api/recommended?ids=${picks.join(',')}`)
  return (data?.rows ?? []).map(r => ({ ...r, items: r.items.filter(a => !list[a.id]) })).filter(r => r.items.length >= 3)
}

async function surprise(params: URLSearchParams, list: List): Promise<Card | undefined> {
  for (const page of [1 + Math.floor(Math.random() * 5), 1]) {
    const p = new URLSearchParams(params)
    p.delete('q'); p.set('sort', 'POPULARITY_DESC'); p.set('page', String(page))
    const r = await fetch(`/api/search?${p}`).then(r => r.json()).catch(() => ({}))
    const pool = ((r.items ?? []) as Card[]).filter(a => !list[a.id] && (a.score ?? 0) >= 70)
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)]
  }
}

function shiftSeason(season: string, year: number, n: number) {
  const i = year * 4 + seasonNames.indexOf(season) + n
  return { season: seasonNames[((i % 4) + 4) % 4], year: Math.floor(i / 4) }
}

function Filters() {
  const [params, setParams] = useSearchParams()
  const set = (k: string, v: string) => setParams(p => { if (v) p.set(k, v); else p.delete(k); if (k === 'year' && !v) p.delete('season'); return p })
  const pill = (k: string, label: string, options: string[][]) => (
    <label className={'chip select' + (params.get(k) ? ' active' : '')}>
      <select value={params.get(k) ?? ''} onChange={e => set(k, e.target.value)} aria-label={label}>
        <option value="">{label}</option>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  )
  const now = new Date().getFullYear()
  const years = Array.from({ length: now + 2 - 1970 }, (_, n) => String(now + 1 - n)).map(y => [y, y])
  const any = keys.some(k => k !== 'q' && params.get(k))
  const list = useList()
  const navigate = useNavigate()
  const [rolling, setRolling] = useState(false)
  const season = params.get('season'), year = Number(params.get('year'))
  const goSeason = (s: { season: string; year: number } | null) => setParams(p => {
    if (s) { p.set('season', s.season); p.set('year', String(s.year)) } else { p.delete('season'); p.delete('year') }
    return p
  })
  const today = new Date(), thisSeason = { season: seasonNames[Math.floor(today.getMonth() / 3)], year: today.getFullYear() }
  return (
    <div className="chips filters">
      {pill('genre', 'Any genre', genres.map(g => [g, g]))}
      {pill('format', 'Any format', formats)}
      {pill('status', 'Any status', statusFilters)}
      {!season && pill('year', 'Any year', years)}
      {season && year ? (
        <span className="stepper">
          <button className="chip" title="Season before" onClick={() => goSeason(shiftSeason(season, year, -1))}>‹</button>
          <button className="chip active" title="Show all seasons" onClick={() => goSeason(null)}>{seasonIcon[season]} {season[0] + season.slice(1).toLowerCase()} {year}</button>
          <button className="chip" title="Season after" onClick={() => goSeason(shiftSeason(season, year, 1))}>›</button>
        </span>
      ) : (
        <button className="chip" onClick={() => goSeason(thisSeason)} title="Browse anime season by season">{seasonIcon[thisSeason.season]} Seasons</button>
      )}
      {pill('sort', 'Most popular', sorts.slice(1))}
      <button className="chip" disabled={rolling} title="Open a random well-rated show that fits these filters"
              onClick={async () => { setRolling(true); const a = await surprise(params, list); setRolling(false); if (a) navigate(`/anime/${a.id}`, { state: a }) }}>
        {rolling ? '…' : '🎲'} Surprise me
      </button>
      {any && <button className="chip" onClick={() => setParams(p => { keys.filter(k => k !== 'q').forEach(k => p.delete(k)); return p })}>✕ Clear filters</button>}
    </div>
  )
}

export function Show() {
  const { id } = useParams()
  return <ShowPage key={id} />
}

function ShowPage() {
  const id = Number(useParams().id)
  const from = useLocation().state as Card | null
  const { data, stale, error } = useApi<Detail>(Number.isInteger(id) && id > 0 ? `/api/anime/${id}` : null)
  const a: Card | undefined = data ?? (from?.id === id ? from : undefined)
  const [playing, setPlaying] = useState(false)
  const [more, setMore] = useState(false)
  if (!a) return <main className="page"><Notice error={error ?? (Number.isInteger(id) && id > 0 ? undefined : 'No such anime.')} />{!error && <SkeletonGrid />}</main>
  const synopsis = a.synopsis ?? ''
  const long = synopsis.length > 600
  return (
    <>
      <Hero a={a} tall key={a.id}>
        <div className="hero-head">
          {a.poster && <img className="hero-poster" src={a.poster} alt="" />}
          <div>
            {a.native && a.native.toLowerCase() !== a.title.toLowerCase() && <div className="kicker">{a.native}</div>}
            <h1>{a.title}</h1>
            <Facts a={a} />
            <div className="chips">
              {a.trailer && <button className="chip active" onClick={() => setPlaying(true)}>▶ Trailer</button>}
              <ListControls a={a} />
            </div>
          </div>
        </div>
      </Hero>
      <main className="page">
        <Notice stale={stale} error={error} />
        <div className="about">
          <div>
            {synopsis ? (
              <>
                <p className={'synopsis' + (long && !more ? ' folded' : '')}>{synopsis}</p>
                <div className="synopsis-foot">
                  {long && <button className="link" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Read more'}</button>}
                  {a.synopsisSource && <small className="quiet">Synopsis from {a.synopsisSource}</small>}
                </div>
              </>
            ) : data ? <p className="quiet">No synopsis yet.</p> : <div className="sk sk-block" />}
          </div>
          {data && (
            <dl className="details">
              {data.studio && <><dt>Studio</dt><dd>{data.studio}</dd></>}
              {data.start && <><dt>{data.status === 'Not yet released' ? 'Starts' : 'Aired'}</dt><dd>{prettyDate(data.start)}{data.end && data.end !== data.start ? ` – ${prettyDate(data.end)}` : ''}</dd></>}
              {data.nextEpisode && data.nextAiring && <><dt>Next episode</dt><dd>Episode {data.nextEpisode}, {new Date(data.nextAiring * 1000).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</dd></>}
            </dl>
          )}
        </div>
        <InCountry id={id} />
        {data && data.links.length > 0 && (
          <section>
            <SectionTitle>Where to watch</SectionTitle>
            <div className="chips">
              {data.links.map(l => <a key={l.url} className="chip" href={l.url} target="_blank" rel="noreferrer" title={`Open ${l.site}`}>▶ {l.site}{l.note ? ` (${l.note})` : ''}</a>)}
            </div>
          </section>
        )}
        {data && data.cast.length > 0 && (
          <section>
            <SectionTitle>Characters &amp; cast</SectionTitle>
            <div className="cast">
              {data.cast.map(c => (
                <div key={c.name + c.role} className="person">
                  <div className="face">{c.image && <img src={c.image} alt="" loading="lazy" />}{c.actorImage && <img className="actor" src={c.actorImage} alt="" loading="lazy" title={c.actor ?? ''} />}</div>
                  <div><strong>{c.name}</strong><small>{c.role}{c.actor ? ` · ${c.actor}` : ''}</small></div>
                </div>
              ))}
            </div>
          </section>
        )}
        {data && <Row title="Related" items={data.related.map(r => r.anime)} note={x => data.related.find(r => r.anime.id === x.id)?.relation} />}
        {data && <Row title="If you liked this" items={data.recommended} />}
      </main>
      {playing && a.trailer && (
        <div className="player" onClick={() => setPlaying(false)} role="dialog" aria-label="Trailer">
          <iframe
            src={a.trailer.site === 'youtube' ? `https://www.youtube-nocookie.com/embed/${a.trailer.id}?autoplay=1&rel=0` : `https://www.dailymotion.com/embed/video/${a.trailer.id}?autoplay=1`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen title="Trailer" />
          <button className="chip close" onClick={() => setPlaying(false)}>✕ Close</button>
        </div>
      )}
    </>
  )
}

function InCountry({ id }: { id: number }) {
  const r = region()
  const { data } = useApi<{ watch: Watch | null }>(`/api/anime/${id}/watch?region=${r}`)
  if (!data) return null
  const w = data.watch
  const logos = (ps: Watch['stream']) => ps.map(p => (
    <a key={p.name} className="chip provider" href={w?.link ?? '#'} target="_blank" rel="noreferrer" title={`${p.name}: see the options on TMDB`}>
      {p.logo && <img src={p.logo} alt="" />}{p.name}
    </a>
  ))
  return (
    <section>
      <SectionTitle note={w ? `TMDB matched “${w.name}”${w.year ? ` (${w.year})` : ''}` : undefined}>Streaming in {regionName(r)}</SectionTitle>
      {!w || (!w.stream.length && !w.buy.length) ? <p className="quiet">Not streaming in {regionName(r)} as far as JustWatch knows.</p> : (
        <>
          {w.stream.length > 0 && <div className="chips">{logos(w.stream)}</div>}
          {w.buy.length > 0 && <><p className="quiet small">Rent or buy</p><div className="chips">{logos(w.buy)}</div></>}
          <p className="quiet small">Availability from JustWatch, via TMDB.</p>
        </>
      )}
    </section>
  )
}

export function MyList() {
  const list = useList()
  const entries = Object.values(list).sort((x, y) => x.anime.title.localeCompare(y.anime.title))
  const rows = [
    { title: '★ Favourites', items: entries.filter(e => e.favourite).map(e => e.anime) },
    ...statuses.filter(s => s !== 'Watching').map(s => ({ title: s, items: entries.filter(e => e.status === s).map(e => e.anime) })),
  ]
  const watching = entries.filter(e => e.status === 'Watching').map(e => e.anime)
  const slides = [...entries.filter(e => e.status === 'Watching'), ...entries.filter(e => e.favourite && e.status !== 'Watching')]
    .filter(e => e.anime.banner).slice(0, 8).map(e => ({ a: e.anime, note: e.status === 'Watching' ? 'Watching' : '★ Favourite' }))
  return (
    <>
    <Carousel slides={slides} />
    <main className="page">
      <SectionTitle note={entries.length ? `${entries.length} shows · saved in this browser` : undefined}>My list</SectionTitle>
      {entries.length === 0 && <p className="quiet">Nothing here yet. Press + on any show to plan to watch it, or ☆ to make it a favourite.</p>}
      <WideRow title="Watching" items={watching} />
      {rows.map(r => <Row key={r.title} title={r.title} items={r.items} />)}
    </main>
    </>
  )
}
