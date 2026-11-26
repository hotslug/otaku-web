import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, NavLink, Outlet, RouterProvider, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Discover, MyList, Show } from './pages.tsx'
import './styles.css'

function Layout() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return (
    <>
      <header className="top">
        <NavLink to="/" className="brand" end><img src="/icon-192.png" alt="" />Otaku</NavLink>
        <nav className="chips">
          <NavLink to="/" end className={({ isActive }) => 'chip' + (isActive ? ' active' : '')}>Discover</NavLink>
          <NavLink to="/list" className={({ isActive }) => 'chip' + (isActive ? ' active' : '')}>My list</NavLink>
        </nav>
        <SearchBox />
      </header>
      <Outlet />
      <footer>Anime data from <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>. Not affiliated with any streaming service.</footer>
    </>
  )
}

// Search as you type, after a short pause; the words go into the URL (?q=), keeping any filters.
function SearchBox() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [text, setText] = useState(params.get('q') ?? '')
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
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  return <input className="search" type="search" placeholder="Search anime" value={text} onChange={e => setText(e.target.value)} aria-label="Search anime" />
}

const router = createBrowserRouter([
  { element: <Layout />, children: [
    { path: '/', element: <Discover /> },
    { path: '/list', element: <MyList /> },
    { path: '/anime/:id', element: <Show /> },
    { path: '*', element: <main className="page"><p className="quiet">Page not found.</p></main> },
  ] },
])

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)
