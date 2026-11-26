import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { countdown, facts, type Card } from './api.ts'
import { setStatus, statuses, toggleFavourite, useList } from './myList.ts'

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <h2 className="section-title"><span className="bar" />{children}{note && <small>{note}</small>}</h2>
}

// A poster card. Its star and + show on hover, or always once set.
export function CardLink({ a, note }: { a: Card; note?: string }) {
  const e = useList()[a.id]
  return (
    <div className="card">
      <Link to={`/anime/${a.id}`} state={a} className="card-link">
        <div className="poster" style={{ background: a.color ?? undefined }}>
          {a.poster && <img src={a.poster} alt="" loading="lazy" onLoad={ev => ev.currentTarget.classList.add('in')} />}
        </div>
        <div className="card-title">{a.title}</div>
        <div className="card-meta">
          {a.score != null && <><span className="star">★</span> {a.score} · </>}{[a.start?.slice(0, 4), a.format].filter(Boolean).join(' · ')}
        </div>
        {note && <div className="card-note">{note}</div>}
      </Link>
      <div className={'card-buttons' + (e ? ' set' : '')}>
        <button className={'round' + (e?.favourite ? ' lit' : '')} title={e?.favourite ? 'Remove from Favourites' : 'Add to Favourites'}
                aria-label="Favourite" onClick={() => toggleFavourite(a)}>{e?.favourite ? '★' : '☆'}</button>
        <button className={'round' + (e?.status ? ' lit' : '')} title={e?.status ? `On My list: ${e.status}. Click to remove` : 'Add to My list (Plan to watch)'}
                aria-label="My list" onClick={() => setStatus(a, e?.status ? null : 'Plan to watch')}>{e?.status ? '✓' : '+'}</button>
      </div>
    </div>
  )
}

// A row that pages with ‹ › and has no scroll bar.
export function Row({ title, items, note }: { title: ReactNode; items: Card[]; note?: (a: Card) => string | undefined }) {
  const strip = useRef<HTMLDivElement>(null)
  const [ends, setEnds] = useState({ start: true, end: false })
  const look = () => {
    const s = strip.current
    if (s) setEnds({ start: s.scrollLeft < 4, end: s.scrollLeft + s.clientWidth > s.scrollWidth - 4 })
  }
  useEffect(() => { look() }, [items])
  const page = (dir: number) => strip.current?.scrollBy({ left: dir * (strip.current.clientWidth - 80), behavior: 'smooth' })
  if (!items.length) return null
  return (
    <section className="row">
      <SectionTitle>{title}</SectionTitle>
      <div className="strip-wrap">
        {!ends.start && <button className="pager left" aria-label="Previous" onClick={() => page(-1)}>‹</button>}
        <div className="strip" ref={strip} onScroll={look}>
          {items.map(a => <CardLink key={a.id} a={a} note={note?.(a)} />)}
        </div>
        {!ends.end && <button className="pager right" aria-label="More" onClick={() => page(1)}>›</button>}
      </div>
    </section>
  )
}

// Wide banner cards for what you're watching, with when the next episode is due.
export function WideRow({ title, items }: { title: string; items: Card[] }) {
  if (!items.length) return null
  const now = Date.now() / 1000
  return (
    <section className="row">
      <SectionTitle>{title}</SectionTitle>
      <div className="strip wide">
        {items.map(a => (
          <Link key={a.id} to={`/anime/${a.id}`} state={a} className="wide-card" style={{ backgroundColor: a.color ?? undefined }}>
            {(a.banner ?? a.poster) && <img src={a.banner ?? a.poster!} alt="" loading="lazy" onLoad={ev => ev.currentTarget.classList.add('in')} />}
            <div className="wide-shade" />
            <div className="wide-body">
              <strong>{a.title}</strong>
              <small>{a.nextEpisode && a.nextAiring && a.nextAiring > now ? `Episode ${a.nextEpisode} ${countdown(a.nextAiring, now)}` : [a.format, a.status].filter(Boolean).join(' · ')}</small>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function Grid({ items }: { items: Card[] }) {
  return <div className="grid">{items.map(a => <CardLink key={a.id} a={a} />)}</div>
}

// Grey shapes with a moving shine while loading, so nothing pops in.
export function SkeletonRow() {
  return (
    <section className="row">
      <div className="sk sk-title" />
      <div className="strip">{Array.from({ length: 10 }, (_, i) => <div key={i} className="card"><div className="sk sk-poster" /><div className="sk sk-line" /><div className="sk sk-line short" /></div>)}</div>
    </section>
  )
}

export function SkeletonGrid() {
  return <div className="grid">{Array.from({ length: 18 }, (_, i) => <div key={i} className="card"><div className="sk sk-poster" /><div className="sk sk-line" /><div className="sk sk-line short" /></div>)}</div>
}

export function Facts({ a }: { a: Card }) {
  return (
    <>
      <div className="facts">{a.score != null && <span className="score">★ {a.score}</span>}<span>{facts(a)}</span></div>
      {a.genres.length > 0 && <div className="genres">{a.genres.slice(0, 5).map(g => <span key={g} className="tag">{g}</span>)}</div>}
    </>
  )
}

// Watching / Plan to watch / Finished, and the star.
export function ListControls({ a }: { a: Card }) {
  const e = useList()[a.id]
  return (
    <div className="chips">
      {statuses.map(s => (
        <button key={s} className={'chip' + (e?.status === s ? ' active' : '')} onClick={() => setStatus(a, e?.status === s ? null : s)}
                title={e?.status === s ? 'Remove from My list' : `Mark as ${s}`}>{e?.status === s ? '✓ ' : ''}{s}</button>
      ))}
      <button className={'chip' + (e?.favourite ? ' active' : '')} onClick={() => toggleFavourite(a)}
              title={e?.favourite ? 'Remove from Favourites' : 'Add to Favourites'}>{e?.favourite ? '★ Favourite' : '☆ Favourite'}</button>
    </div>
  )
}

// The big picture at the top of a page: banner, a shade for the words, and whatever goes on it.
export function Hero({ a, children, tall }: { a: Card; children: ReactNode; tall?: boolean }) {
  return (
    <div className={'hero' + (tall ? ' tall' : '')}>
      <div className="hero-picture" style={{ backgroundColor: a.color ?? undefined }}>
        {(a.banner || a.poster) && <img src={a.banner ?? a.poster!} alt="" className={a.banner ? '' : 'from-poster'} onLoad={ev => ev.currentTarget.classList.add('in')} />}
      </div>
      <div className="hero-shade" />
      <div className="hero-body">{children}</div>
    </div>
  )
}

// Trending shows with a banner, moving on every 8 seconds; hovering holds it.
export function Carousel({ slides }: { slides: { a: Card; note: string }[] }) {
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (held || slides.length < 2) return
    const t = setTimeout(() => setI(n => (n + 1) % slides.length), 8000)
    return () => clearTimeout(t)
  }, [i, held, slides.length])
  if (!slides.length) return null
  const { a, note } = slides[i % slides.length]
  return (
    <div className="carousel" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <Hero a={a} key={a.id}>
        <div className="kicker">{note}</div>
        <h1>{a.title}</h1>
        <Facts a={a} />
        {a.synopsis && <p className="hero-synopsis">{a.synopsis.split('\n')[0]}</p>}
        <div className="chips">
          <Link to={`/anime/${a.id}`} state={a} className="chip active">More info</Link>
          <ListControls a={a} />
        </div>
      </Hero>
      {slides.length > 1 && (
        <div className="dots">
          {slides.map((s, n) => <button key={s.a.id} className={n === i % slides.length ? 'on' : ''} aria-label={`Show ${s.a.title}`} onClick={() => setI(n)} />)}
        </div>
      )}
    </div>
  )
}

export function Notice({ stale, error }: { stale?: boolean; error?: string }) {
  if (error) return <p className="notice">⚠︎ {error} <button className="chip" onClick={() => location.reload()}>Try again</button></p>
  if (stale) return <p className="notice">Showing saved data: AniList isn't answering right now.</p>
  return null
}
