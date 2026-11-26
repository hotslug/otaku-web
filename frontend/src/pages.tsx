import { useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { prettyDate, useApi, type Card, type Detail, type Row as RowData } from './api.ts'
import { statuses, useList } from './myList.ts'
import { Carousel, Facts, Grid, Hero, ListControls, Notice, Row, SectionTitle, SkeletonGrid, SkeletonRow } from './ui.tsx'

const genres = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery',
  'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller']
const formats = [['TV', 'TV'], ['MOVIE', 'Movie'], ['OVA', 'OVA'], ['ONA', 'ONA'], ['SPECIAL', 'Special'], ['TV_SHORT', 'TV short']]
const statusFilters = [['RELEASING', 'Airing now'], ['FINISHED', 'Finished'], ['NOT_YET_RELEASED', 'Coming soon']]
const sorts = [['POPULARITY_DESC', 'Most popular'], ['SCORE_DESC', 'Best rated'], ['TRENDING_DESC', 'Trending'], ['START_DATE_DESC', 'Newest']]
const seasons = [['WINTER', 'Winter'], ['SPRING', 'Spring'], ['SUMMER', 'Summer'], ['FALL', 'Fall']]
const keys = ['q', 'genre', 'format', 'status', 'sort', 'year', 'season']

// Discover: the carousel and rows, or results when there's a search or a filter. Everything is in the URL, so results can be shared.
export function Discover() {
  const [params] = useSearchParams()
  const searching = keys.some(k => params.get(k))
  const query = new URLSearchParams(keys.flatMap(k => (params.get(k) ? [[k, params.get(k)!]] : []))).toString()
  const home = useApi<{ rows: RowData[] }>(searching ? null : '/api/home')
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
          rows.map(r => <Row key={r.title} title={r.title} items={r.items} />)
        )}
      </main>
    </>
  )
}

// Filter pills: native selects styled as chips.
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
  return (
    <div className="chips filters">
      {pill('genre', 'Any genre', genres.map(g => [g, g]))}
      {pill('format', 'Any format', formats)}
      {pill('status', 'Any status', statusFilters)}
      {pill('year', 'Any year', years)}
      {params.get('year') && pill('season', 'Any season', seasons)}
      {pill('sort', 'Most popular', sorts.slice(1))}
      {any && <button className="chip" onClick={() => setParams(p => { keys.filter(k => k !== 'q').forEach(k => p.delete(k)); return p })}>✕ Clear filters</button>}
    </div>
  )
}

// A show's page. The card it was opened from shows at once; the rest fills in.
export function Show() {
  const id = Number(useParams().id)
  const from = useLocation().state as Card | null
  const { data, stale, error } = useApi<Detail>(Number.isInteger(id) && id > 0 ? `/api/anime/${id}` : null)
  const a: Card | undefined = data ?? (from?.id === id ? from : undefined)
  const [playing, setPlaying] = useState(false)
  const [more, setMore] = useState(false)
  if (!a) return <main className="page"><Notice error={error ?? (Number.isInteger(id) ? undefined : 'No such anime.')} />{!error && <SkeletonGrid />}</main>
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
                {long && <button className="link" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Read more'}</button>}
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

// My list: favourites, then each status. Saved in this browser.
export function MyList() {
  const list = useList()
  const entries = Object.values(list).sort((x, y) => x.anime.title.localeCompare(y.anime.title))
  const rows = [
    { title: '★ Favourites', items: entries.filter(e => e.favourite).map(e => e.anime) },
    ...statuses.map(s => ({ title: s, items: entries.filter(e => e.status === s).map(e => e.anime) })),
  ]
  return (
    <main className="page">
      <SectionTitle note={entries.length ? `${entries.length} shows · saved in this browser` : undefined}>My list</SectionTitle>
      {entries.length === 0 && <p className="quiet">Nothing here yet. Press + on any show to plan to watch it, or ☆ to make it a favourite.</p>}
      {rows.map(r => <Row key={r.title} title={r.title} items={r.items} />)}
    </main>
  )
}
