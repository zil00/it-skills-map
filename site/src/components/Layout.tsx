import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
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
  const { pathname } = useLocation()
  // Block body on purpose: newer Chrome returns a Promise from scrollTo, and an
  // effect must return nothing or a cleanup function (returning it crashed the site).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
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
