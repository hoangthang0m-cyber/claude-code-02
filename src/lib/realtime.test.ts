import { describe, expect, it } from "vitest"

import {
  HEALTHY_POLL_MS,
  REALTIME_POLL_MS,
  aggregateRealtimeStatus,
  didReconnect,
  nextRealtimeStatus,
  pollIntervalMs,
  shouldRefetchOnSnapshot,
  snapshotEvent,
  type RealtimeStatus,
} from "@/lib/realtime"

describe("nextRealtimeStatus (SPEC §6.6 / §5.6 R3, task 7.1)", () => {
  it("a server snapshot means the channel is live", () => {
    expect(nextRealtimeStatus("connecting", "server")).toBe("live")
    expect(nextRealtimeStatus("offline", "server")).toBe("live")
    expect(nextRealtimeStatus("live", "server")).toBe("live")
  })

  it("a blip before the first connect stays 'connecting', not 'offline'", () => {
    expect(nextRealtimeStatus("connecting", "cache")).toBe("connecting")
    expect(nextRealtimeStatus("connecting", "error")).toBe("connecting")
  })

  it("a cache snapshot or error after being live drops to 'offline'", () => {
    expect(nextRealtimeStatus("live", "cache")).toBe("offline")
    expect(nextRealtimeStatus("live", "error")).toBe("offline")
    expect(nextRealtimeStatus("offline", "error")).toBe("offline")
  })

  it("maps fromCache to the right event", () => {
    expect(snapshotEvent(true)).toBe("cache")
    expect(snapshotEvent(false)).toBe("server")
  })
})

describe("pollIntervalMs — fallback polling 10–15s while the channel is down", () => {
  it("polls at the fallback rate unless the channel is live", () => {
    expect(pollIntervalMs("live")).toBe(HEALTHY_POLL_MS)
    expect(pollIntervalMs("offline")).toBe(REALTIME_POLL_MS)
    expect(pollIntervalMs("connecting")).toBe(REALTIME_POLL_MS)
  })

  it("the fallback rate is within SPEC's 10–15 second window", () => {
    expect(REALTIME_POLL_MS).toBeGreaterThanOrEqual(10_000)
    expect(REALTIME_POLL_MS).toBeLessThanOrEqual(15_000)
  })
})

describe("didReconnect — SPEC §6.6 R3 resync-on-recovery", () => {
  it("is true only when coming back from a drop", () => {
    expect(didReconnect("offline", "live")).toBe(true)
  })

  it("a first connect does not count as a reconnect", () => {
    expect(didReconnect("connecting", "live")).toBe(false)
  })

  it("no reconnect on other transitions", () => {
    const all: RealtimeStatus[] = ["connecting", "live", "offline"]
    for (const prev of all) {
      for (const next of all) {
        if (prev === "offline" && next === "live") continue
        expect(didReconnect(prev, next)).toBe(false)
      }
    }
  })
})

describe("aggregateRealtimeStatus — multi-room dashboard (task 7.6)", () => {
  it("live only when every room is live", () => {
    expect(aggregateRealtimeStatus(["live", "live"])).toBe("live")
  })

  it("any room offline → offline (some numbers may be stale)", () => {
    expect(aggregateRealtimeStatus(["live", "offline", "connecting"])).toBe(
      "offline"
    )
  })

  it("still connecting while a room has not reported and none is offline", () => {
    expect(aggregateRealtimeStatus(["live", "connecting"])).toBe("connecting")
  })

  it("no rooms → nothing to wait for → live", () => {
    expect(aggregateRealtimeStatus([])).toBe("live")
  })
})

describe("shouldRefetchOnSnapshot — 'bảng cập nhật khi người khác đổi trạng thái'", () => {
  it("refetches on a server snapshot that carries a document change", () => {
    expect(
      shouldRefetchOnSnapshot({ first: false, fromCache: false, docChangeCount: 1 })
    ).toBe(true)
  })

  it("ignores the priming first snapshot", () => {
    expect(
      shouldRefetchOnSnapshot({ first: true, fromCache: false, docChangeCount: 5 })
    ).toBe(false)
  })

  it("ignores a cache-only snapshot (offline / catching up)", () => {
    expect(
      shouldRefetchOnSnapshot({ first: false, fromCache: true, docChangeCount: 3 })
    ).toBe(false)
  })

  it("ignores a metadata-only server snapshot with no doc changes", () => {
    expect(
      shouldRefetchOnSnapshot({ first: false, fromCache: false, docChangeCount: 0 })
    ).toBe(false)
  })
})
