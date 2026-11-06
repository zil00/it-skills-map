import { useEffect, useLayoutEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { useMeta } from '../lib/data'
import { fmtDate, num } from '../lib/format'

const NAV = [
  ['/', 'Roles'],
  ['/compare', 'Compare roles'],
  ['/skills', 'Skills'],
  ['/breaking-in', 'Breaking in'],
  ['/about', 'About the data'],
] as const

export default function Layout() {
  const { data: meta } = useMeta()
  useScrollMemory()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-6 w-6" />
            IT Skills Map
          </NavLink>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1.5 ${isActive ? 'bg-req/10 font-medium text-req' : 'text-ink-2 hover:bg-black/5'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-line text-xs text-ink-3">
        <div className="mx-auto max-w-5xl px-4 py-4">
          {meta && (
            <>
              Based on {num(meta.in_scope_unique)} IT job postings in Canada from LinkedIn's public job search,
              posted {fmtDate(meta.posted_from)} – {fmtDate(meta.posted_to)}. Skills are pulled out by keyword rules,
              so expect some misses. Not affiliated with LinkedIn.
            </>
          )}
        </div>
      </footer>
    </div>
  )
}

/**
 * New page: start at the top. Back/Forward: return to where you were on that page.
 * Positions are kept per history entry (location.key) for this tab.
 */
function useScrollMemory() {
  const { pathname, key } = useLocation()
  const navType = useNavigationType()
  const saved = useRef(new Map<string, number>())
  const current = useRef({ key, pathname })

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const onScroll = () => saved.current.set(current.current.key, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Layout effect: switch keys before the browser fires the scroll event caused by the new page's height,
  // so that event can't overwrite the old page's saved position.
  useLayoutEffect(() => {
    const prev = current.current
    current.current = { key, pathname }
    if (key === prev.key) return
    // Note: block bodies on purpose. Newer Chrome returns a Promise from scrollTo, and an effect
    // must return nothing or a cleanup function (returning it crashed the site, T-01).
    if (navType === 'POP' && saved.current.has(key)) {
      const y = saved.current.get(key)!
      // The page may still be filling in; retry for up to ~1 s until it is tall enough.
      let tries = 0
      let raf = 0
      const go = () => {
        window.scrollTo(0, y)
        if (Math.abs(window.scrollY - y) > 2 && tries++ < 60) raf = requestAnimationFrame(go)
      }
      go()
      return () => {
        cancelAnimationFrame(raf)
      }
    }
    if (pathname !== prev.pathname) {
      window.scrollTo(0, 0)
    } else {
      // Same page, new history entry (e.g. a filter changed the link): keep the position.
      saved.current.set(key, window.scrollY)
    }
  }, [key, pathname, navType])
}
