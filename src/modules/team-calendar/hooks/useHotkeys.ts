"use client"

import * as React from "react"

// Global calendar shortcuts (Mục D task 6.10): d/w/m/y/a switch view, t = today,
// ←/→ navigate, / focuses search. Ignored while typing in an input / textarea /
// contenteditable, or with a modifier held.
export interface HotkeyHandlers {
  onView?: (view: "day" | "week" | "month" | "year" | "agenda") => void
  onToday?: () => void
  onPrev?: () => void
  onNext?: () => void
  onSearch?: () => void
}

const VIEW_KEYS: Record<string, "day" | "week" | "month" | "year" | "agenda"> = {
  d: "day",
  w: "week",
  m: "month",
  y: "year",
  a: "agenda",
}

export function useHotkeys(handlers: HotkeyHandlers): void {
  const ref = React.useRef(handlers)
  React.useEffect(() => {
    ref.current = handlers
  })

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return
      }

      const h = ref.current
      const key = e.key.toLowerCase()

      if (VIEW_KEYS[key]) {
        h.onView?.(VIEW_KEYS[key])
      } else if (key === "t") {
        h.onToday?.()
      } else if (e.key === "ArrowLeft") {
        h.onPrev?.()
      } else if (e.key === "ArrowRight") {
        h.onNext?.()
      } else if (e.key === "/") {
        e.preventDefault()
        h.onSearch?.()
      } else {
        return
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
