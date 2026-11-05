import { useEffect, useState } from 'react'
import type { CellFile, Meta, RoleFile, RoleMeta, Skill } from './types'

const cache = new Map<string, Promise<unknown>>()

function load<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    const url = `${import.meta.env.BASE_URL}data/${file}`
    cache.set(
      file,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${file} (${r.status})`)
        return r.json()
      }),
    )
  }
  return cache.get(file) as Promise<T>
}

/** Load one JSON file; returns undefined while loading. */
export function useJson<T>(file: string | null): { data?: T; error?: string } {
  const [state, setState] = useState<{ file: string | null; data?: T; error?: string }>({ file })
  useEffect(() => {
    if (!file) return
    let live = true
    load<T>(file).then(
      (data) => live && setState({ file, data }),
      (e: Error) => live && setState({ file, error: e.message }),
    )
    return () => {
      live = false
    }
  }, [file])
  return state.file === file ? state : {}
}

/** Load several files at once (used by Compare). */
export function useJsonMany<T>(files: string[]): T[] | undefined {
  const key = files.join('|')
  const [state, setState] = useState<{ key: string; data?: T[] }>({ key })
  useEffect(() => {
    let live = true
    Promise.all(files.map((f) => load<T>(f))).then((data) => live && setState({ key, data }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state.data : undefined
}

export const useMeta = () => useJson<Meta>('meta.json')
export const useRoles = () => useJson<RoleMeta[]>('roles.json')
export const useSkills = () => useJson<Skill[]>('skills.json')
export const useSummary = () => useJson<CellFile>('summary.json')
export const useEntry = () => useJson<CellFile>('entry_level.json')
export const useRole = (slug: string) => useJson<RoleFile>(`roles/${slug}.json`)
export const roleFile = (slug: string) => `roles/${slug}.json`
