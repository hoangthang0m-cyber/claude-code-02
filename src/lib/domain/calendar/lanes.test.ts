import { describe, expect, it } from "vitest"

import { packLanes } from "@/lib/domain/calendar/lanes"

describe("packLanes", () => {
  it("three items at the same time → three columns (task 6.3)", () => {
    const out = packLanes([
      { id: "a", startMin: 540, endMin: 600 },
      { id: "b", startMin: 540, endMin: 600 },
      { id: "c", startMin: 540, endMin: 600 },
    ])
    expect(out.map((o) => o.laneCount)).toEqual([3, 3, 3])
    expect(new Set(out.map((o) => o.lane))).toEqual(new Set([0, 1, 2]))
  })

  it("non-overlapping items each get a full-width lane", () => {
    const out = packLanes([
      { id: "a", startMin: 540, endMin: 600 },
      { id: "b", startMin: 600, endMin: 660 },
    ])
    expect(out).toEqual([
      { id: "a", lane: 0, laneCount: 1 },
      { id: "b", lane: 0, laneCount: 1 },
    ])
  })

  it("partial overlap reuses a freed lane", () => {
    // a: 9–10, b: 9:30–11, c: 10–11  → a|b side by side, c reuses a's lane
    const out = new Map(
      packLanes([
        { id: "a", startMin: 540, endMin: 600 },
        { id: "b", startMin: 570, endMin: 660 },
        { id: "c", startMin: 600, endMin: 660 },
      ]).map((o) => [o.id, o])
    )
    expect(out.get("a")!.lane).toBe(0)
    expect(out.get("b")!.lane).toBe(1)
    expect(out.get("c")!.lane).toBe(0)
    // one connected cluster → all report the same laneCount
    expect(out.get("a")!.laneCount).toBe(2)
    expect(out.get("c")!.laneCount).toBe(2)
  })

  it("separate clusters get independent lane counts", () => {
    const out = new Map(
      packLanes([
        { id: "a", startMin: 540, endMin: 600 },
        { id: "b", startMin: 540, endMin: 600 },
        { id: "c", startMin: 700, endMin: 760 },
      ]).map((o) => [o.id, o])
    )
    expect(out.get("a")!.laneCount).toBe(2)
    expect(out.get("c")!.laneCount).toBe(1)
  })

  it("empty input → empty", () => {
    expect(packLanes([])).toEqual([])
  })
})
