import { createContext, useContext, useState, type ReactNode } from 'react'
import { NO_FILTERS, type Filters } from './aggregate'

interface Ctx {
  filters: Filters
  setFilters: (f: Filters) => void
}

const FilterContext = createContext<Ctx>({ filters: NO_FILTERS, setFilters: () => {} })

/** Filters are shared by all pages, so they stay set while moving around the site. */
export function FilterProvider({ children }: { children: ReactNode }) {
  // Filters can also start from the link, e.g. #/roles/help-desk-service-desk?province=ON&remote=hybrid
  const [filters, setFilters] = useState<Filters>(() => {
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
    return { province: q.get('province') ?? '', seniority: q.get('seniority') ?? '', remote: q.get('remote') ?? '' }
  })
  return <FilterContext.Provider value={{ filters, setFilters }}>{children}</FilterContext.Provider>
}

export const useFilters = () => useContext(FilterContext)
