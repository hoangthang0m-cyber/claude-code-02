// SPEC §6.6 / §5.6 R3, tasks 7.1 / 7.6: the shared near-real-time fold for the
// content table and the progress dashboard.
//
// The realtime "room" is a Firestore listener scoped to a project
// (`contentItems where project_id == <id>`). That stream is only a change
// signal + a connection gauge — the filtered list / the dashboard numbers still
// come from the server. This module holds the pure decisions layered on top so
// they can be unit-tested without a browser.

// Poll cadence: the fallback rate while the realtime channel is down (SPEC §6.6
// "fallback polling 10–15 giây"), and a slow safety net while it is healthy.
export const REALTIME_POLL_MS = 12_000
export const HEALTHY_POLL_MS = 60_000

export type RealtimeStatus = "connecting" | "live" | "offline"

// Fold a listener event into the channel status. A server snapshot means we are
// live; a cache snapshot or an error only counts as "offline" once we have
// actually been connected (the first attempt is just "connecting").
export function nextRealtimeStatus(
  current: RealtimeStatus,
  event: "server" | "cache" | "error"
): RealtimeStatus {
  if (event === "server") return "live"
  if (current === "connecting") return "connecting"
  return "offline"
}

export function snapshotEvent(fromCache: boolean): "server" | "cache" {
  return fromCache ? "cache" : "server"
}

export function pollIntervalMs(status: RealtimeStatus): number {
  return status === "live" ? HEALTHY_POLL_MS : REALTIME_POLL_MS
}

// SPEC §6.6 R3: when the channel recovers after a drop, resync the displayed
// data (don't sit on stale numbers silently). A first connect doesn't count —
// the screen is loading anyway.
export function didReconnect(
  prev: RealtimeStatus,
  next: RealtimeStatus
): boolean {
  return prev === "offline" && next === "live"
}

// A Firestore snapshot event → should the screen refetch?
//   first snapshot                     → no (listener priming itself)
//   cache snapshot (offline / catching up) → no (not authoritative)
//   server snapshot with ≥ 1 doc change → yes (someone changed a row)
export function shouldRefetchOnSnapshot(input: {
  first: boolean
  fromCache: boolean
  docChangeCount: number
}): boolean {
  if (input.first || input.fromCache) return false
  return input.docChangeCount > 0
}

// task 7.6: a manager's dashboard spans several project rooms. The overall
// channel is only "live" when every room is live; any room offline makes it
// offline (some numbers may be stale); otherwise it is still connecting. No
// rooms (a manager with no projects) → nothing to wait for, so "live".
export function aggregateRealtimeStatus(
  statuses: readonly RealtimeStatus[]
): RealtimeStatus {
  if (statuses.length === 0) return "live"
  if (statuses.some((s) => s === "offline")) return "offline"
  if (statuses.some((s) => s === "connecting")) return "connecting"
  return "live"
}
