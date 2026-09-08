"use client"

import * as React from "react"

// A timestamp that re-renders once a minute — drives the "now" line (task 6.4)
// and any relative-time labels. Aligns the first tick to the top of the minute.
export function useCurrentMinute(): number {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    const align = setTimeout(() => {
      setNow(Date.now())
      interval = setInterval(() => setNow(Date.now()), 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => {
      clearTimeout(align)
      clearInterval(interval)
    }
  }, [])

  return now
}
