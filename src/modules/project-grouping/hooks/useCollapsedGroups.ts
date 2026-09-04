"use client"

import * as React from "react"

// task 4.3 — which list blocks the viewer has collapsed, persisted in
// localStorage. Same useSyncExternalStore shape as useSidebarNavOrder so there
// is no setState-in-effect and SSR renders everything expanded.

const STORAGE_KEY = "pg:list:collapsed"

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  return () => window.removeEventListener("storage", callback)
}

function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function getServerSnapshot() {
  return null
}

export function useCollapsedGroups() {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const collapsed = React.useMemo<ReadonlySet<string>>(() => {
    if (!raw) return new Set()
    try {
      const parsed = JSON.parse(raw)
      return new Set(
        Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
      )
    } catch {
      return new Set()
    }
  }, [raw])

  const toggle = React.useCallback(
    (key: string) => {
      const next = new Set(collapsed)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
        window.dispatchEvent(new Event("storage"))
      } catch {
        /* private mode / blocked — collapse state is a convenience only */
      }
    },
    [collapsed]
  )

  return { collapsed, toggle }
}
