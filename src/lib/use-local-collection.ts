import { useCallback, useEffect, useMemo, useState } from "react"

// Standalone replacement for @omg-dev/sdk's useCollection.
//
// The original hook talks to the omg.dev backend: a WebSocket at /__vibes_sub
// plus REST at /api/<collection>, both gated behind an omg.dev session cookie.
// On a plain static host (Vercel, Netlify, GitHub Pages) those endpoints do not
// exist. The SDK then reports status "auth_required", waits for an auth context
// that never becomes ready, and leaves `loading` true forever — and App.tsx
// renders an empty <main> while the profile is loading, which is the white
// screen.
//
// This keeps the same shape (data / loading / create / update / remove) but
// persists to localStorage, so the app runs anywhere with no backend.

const STORAGE_PREFIX = "hi-pg5q6:"

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function write<T>(key: string, rows: T[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(rows))
  } catch {
    // Private mode or a full quota: the session still works, it just will not
    // survive a reload. Never throw out of a state update.
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export type LocalCollectionOptions = {
  /** Collection name; also the localStorage key suffix. */
  collection: string
}

export type LocalCollectionReturn<T extends { id: string }> = {
  data: T[]
  loading: boolean
  error: string | null
  status: "live"
  create: (item: Partial<T>) => Promise<T>
  update: (id: string, patch: Partial<T>) => Promise<T>
  remove: (id: string) => Promise<void>
  refresh: () => void
}

export function useLocalCollection<T extends { id: string }>(
  opts: LocalCollectionOptions,
): LocalCollectionReturn<T> {
  const key = STORAGE_PREFIX + opts.collection
  const [data, setData] = useState<T[]>(() => read<T>(key))

  // Re-read when another instance or tab writes the same collection.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setData(read<T>(key))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [key])

  const commit = useCallback(
    (rows: T[]) => {
      setData(rows)
      write(key, rows)
    },
    [key],
  )

  const create = useCallback(
    async (item: Partial<T>): Promise<T> => {
      const row = { ...item, id: item.id ?? newId() } as T
      setData((prev) => {
        const next = [...prev, row]
        write(key, next)
        return next
      })
      return row
    },
    [key],
  )

  const update = useCallback(
    async (id: string, patch: Partial<T>): Promise<T> => {
      let updated: T | undefined
      setData((prev) => {
        const next = prev.map((row) => {
          if (row.id !== id) return row
          updated = { ...row, ...patch }
          return updated
        })
        write(key, next)
        return next
      })
      return (updated ?? ({ id, ...patch } as T))
    },
    [key],
  )

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setData((prev) => {
        const next = prev.filter((row) => row.id !== id)
        write(key, next)
        return next
      })
    },
    [key],
  )

  const refresh = useCallback(() => setData(read<T>(key)), [key])

  return useMemo(
    () => ({
      data,
      // Never "loading": there is nothing to wait for, and App.tsx shows a
      // blank screen while this is true.
      loading: false,
      error: null,
      status: "live" as const,
      create,
      update,
      remove,
      refresh,
    }),
    [data, create, update, remove, refresh],
  )
}
