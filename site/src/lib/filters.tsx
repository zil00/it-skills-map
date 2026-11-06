import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NO_FILTERS, type Filters } from './aggregate'

interface Ctx {
  filters: Filters
  setFilters: (f: Filters) => void
}

const FilterContext = createContext<Ctx>({ filters: NO_FILTERS, setFilters: () => {} })

const KEYS = ['province', 'seniority', 'remote'] as const
const fromParams = (p: URLSearchParams): Filters => ({
  province: p.get('province') ?? '',
  seniority: p.get('seniority') ?? '',
  remote: p.get('remote') ?? '',
})
const same = (a: Filters, b: Filters) => KEYS.every((k) => a[k] === b[k])

/**
 * Filters are shared by all pages, so they stay set while moving around the site, and they are
 * mirrored in the link (e.g. #/roles/help-desk-service-desk?province=ON&remote=hybrid) so a
 * filtered view can be shared, bookmarked and refreshed. Must sit inside the router.
 */
export function FilterProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const [filters, setState] = useState<Filters>(() => fromParams(params))

  const writeUrl = useCallback(
    (f: Filters) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const k of KEYS) {
            if (f[k]) next.set(k, f[k])
            else next.delete(k)
          }
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  useEffect(() => {
    if (KEYS.some((k) => params.has(k))) {
      // A link that names filters wins, even if the site is already open.
      const f = fromParams(params)
      setState((cur) => (same(cur, f) ? cur : f))
    } else if (!same(filters, NO_FILTERS)) {
      // Moved to a page via a plain link: keep the current filters and put them in its URL.
      writeUrl(filters)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const setFilters = useCallback(
    (f: Filters) => {
      setState(f)
      writeUrl(f)
    },
    [writeUrl],
  )

  return <FilterContext.Provider value={{ filters, setFilters }}>{children}</FilterContext.Provider>
}

export const useFilters = () => useContext(FilterContext)
