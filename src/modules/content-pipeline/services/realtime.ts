// SPEC §6.6 / §5.6 R3, task 7.1: near-real-time for the content table.
//
// The realtime "room" is a Firestore listener scoped to
// `contentItems where project_id == <projectId>` (see useProjectRealtime). That
// stream is only a change signal + a connection gauge — the filtered/sorted
// list itself still comes from the server (task 5.2). This module holds the
// pure decisions layered on top so they can be unit-tested without a browser.

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
// rows (don't sit on stale data silently). A first connect doesn't count — the
// list is loading anyway.
export function didReconnect(
  prev: RealtimeStatus,
  next: RealtimeStatus
): boolean {
  return prev === "offline" && next === "live"
}

// A Firestore snapshot event → should the filtered list be refetched?
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
