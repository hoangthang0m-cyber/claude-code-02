"use client"

import * as React from "react"

const STORAGE_KEY = "sidebar-nav-order"

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

export function useSidebarNavOrder(defaultOrder: string[]) {
  const storedRaw = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const order = React.useMemo(() => {
    if (!storedRaw) return defaultOrder
    try {
      const parsed = JSON.parse(storedRaw)
      if (!Array.isArray(parsed)) return defaultOrder
      const known = new Set(defaultOrder)
      const kept = parsed.filter((id): id is string => typeof id === "string" && known.has(id))
      const missing = defaultOrder.filter((id) => !kept.includes(id))
      return [...kept, ...missing]
    } catch {
      return defaultOrder
    }
  }, [storedRaw, defaultOrder])

  const setOrder = React.useCallback((next: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      // storage events don't fire in the tab that made the change — notify this tab too
      window.dispatchEvent(new Event("storage"))
    } catch {
      // localStorage unavailable (private mode/disabled) — order just won't persist
    }
  }, [])

  return { order, setOrder }
}
