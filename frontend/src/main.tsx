import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, NavLink, Outlet, RouterProvider, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Discover, MyList, Show } from './pages.tsx'
import { Schedule } from './schedule.tsx'
import './styles.css'

function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const [over, setOver] = useState(false)
  const header = useRef<HTMLElement>(null)
  useEffect(() => {
    const h = header.current!
    const size = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', `${h.offsetHeight}px`))
    size.observe(h)
    return () => size.disconnect()
  }, [])
  useEffect(() => {
    const look = () => setOver(window.scrollY < 40 && !!document.querySelector('.top + .hero, .top + .carousel'))
    look()
    const watch = new MutationObserver(look)
    watch.observe(document.getElementById('root')!, { childList: true, subtree: true })
    window.addEventListener('scroll', look, { passive: true })
    return () => { watch.disconnect(); window.removeEventListener('scroll', look) }
  }, [])
  return (
    <>
      <header ref={header} className={'top' + (over ? ' over' : '')}>
        <NavLink to="/" className="brand" end><img src="/icon-192.png" alt="" /><span>Otaku</span></NavLink>
        <nav className="chips">
          <NavLink to="/" end className={({ isActive }) => 'chip' + (isActive ? ' active' : '')}>Discover</NavLink>
          <NavLink to="/schedule" className={({ isActive }) => 'chip' + (isActive ? ' active' : '')}>Schedule</NavLink>
          <NavLink to="/list" className={({ isActive }) => 'chip' + (isActive ? ' active' : '')}>My list</NavLink>
        </nav>
        <ThemeButton />
        <SearchBox />
      </header>
      <Outlet />
      <footer>Anime data from <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>. Not affiliated with any streaming service.</footer>
    </>
  )
}

const themes = ['auto', 'light', 'dark'] as const
function ThemeButton() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? 'auto')
  const next = themes[(themes.indexOf(theme as typeof themes[number]) + 1) % themes.length]
  const pick = () => {
    if (next === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next
    try { if (next === 'auto') localStorage.removeItem('otaku.theme'); else localStorage.setItem('otaku.theme', next) } catch { }
    setTheme(next)
  }
  const label = { auto: 'Theme: auto (follows your system)', light: 'Theme: light', dark: 'Theme: dark' }[theme] ?? 'Theme'
  return <button className="chip theme" onClick={pick} title={`${label}. Click for ${next}`} aria-label={`${label}. Click for ${next}`}>{{ auto: '◐', light: '☀︎', dark: '☾' }[theme]}</button>
}

function SearchBox() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [text, setText] = useState(params.get('q') ?? '')
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); box.current?.focus() }
      if (e.key === 'Escape' && e.target === box.current) box.current?.blur()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useEffect(() => setText(params.get('q') ?? ''), [params])
  useEffect(() => {
    const q = text.trim()
    if (q === (params.get('q') ?? '') || (q.length > 0 && q.length < 2)) return
    const t = setTimeout(() => {
      const next = new URLSearchParams(pathname === '/' ? params : undefined)
      if (q) next.set('q', q); else next.delete('q')
      navigate({ pathname: '/', search: next.toString() }, { replace: pathname === '/' })
    }, 450)
    return () => clearTimeout(t)
  }, [text])
  return <input ref={box} className="search" type="search" placeholder="Search anime   ( / )" value={text} onChange={e => setText(e.target.value)} aria-label="Search anime" />
}

const router = createBrowserRouter([
  { element: <Layout />, children: [
    { path: '/', element: <Discover /> },
    { path: '/list', element: <MyList /> },
    { path: '/schedule', element: <Schedule /> },
    { path: '/anime/:id', element: <Show /> },
    { path: '*', element: <main className="page"><p className="quiet">Page not found.</p></main> },
  ] },
])

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)
