import { describe, expect, it } from "vitest"

import { computeReorder, nextSortIndex } from "@/lib/domain"

// project-grouping change task 6.5 — many consecutive drags within a bucket plus
// moves between buckets: `sort_index` stays unique inside every bucket and the
// resolved order is stable across "reloads" (a re-sort from the stored indices).

interface Row {
  id: string
  group_id: string | null
  sort_index: number
}

function bucketRows(rows: Row[], bucket: string | null): Row[] {
  return rows
    .filter((r) => r.group_id === bucket)
    .sort((a, b) => a.sort_index - b.sort_index || (a.id < b.id ? -1 : 1))
}

// apply computeReorder's writes to the in-memory rows
function reorder(rows: Row[], id: string, afterId: string | null) {
  const row = rows.find((r) => r.id === id)!
  const writes = computeReorder(bucketRows(rows, row.group_id), id, afterId)
  for (const [wid, si] of writes) {
    rows.find((r) => r.id === wid)!.sort_index = si
  }
}

// move a project into another bucket → end of that bucket (task 3.2)
function moveBucket(rows: Row[], id: string, target: string | null) {
  const row = rows.find((r) => r.id === id)!
  const indices = bucketRows(rows, target).map((r) => r.sort_index)
  row.group_id = target
  row.sort_index = nextSortIndex(indices)
}

function assertBucketsSane(rows: Row[]) {
  for (const bucket of [null, "gA", "gB"]) {
    const b = bucketRows(rows, bucket)
    const idx = b.map((r) => r.sort_index)
    expect(new Set(idx).size, `bucket ${bucket} has duplicate sort_index`).toBe(
      idx.length
    )
  }
}

function orderOf(rows: Row[], bucket: string | null): string[] {
  return bucketRows(rows, bucket).map((r) => r.id)
}

describe("sort_index stays consistent through many operations (task 6.5)", () => {
  it("consecutive drags in one bucket keep a unique, stable order", () => {
    const rows: Row[] = ["a", "b", "c", "d", "e"].map((id, i) => ({
      id,
      group_id: "gA",
      sort_index: (i + 1) * 100,
    }))

    reorder(rows, "e", null) // e a b c d
    reorder(rows, "a", "d") // e b c d a
    reorder(rows, "c", null) // c e b d a
    reorder(rows, "b", "a") // c e d a b
    reorder(rows, "d", "c") // c d e a b
    reorder(rows, "e", null) // e c d a b

    assertBucketsSane(rows)
    expect(orderOf(rows, "gA")).toEqual(["e", "c", "d", "a", "b"])

    // "reload": the order is a pure function of the stored indices
    const reloaded = bucketRows(structuredClone(rows), "gA").map((r) => r.id)
    expect(reloaded).toEqual(["e", "c", "d", "a", "b"])
  })

  it("moving projects between buckets never collides and each bucket stays ordered", () => {
    const rows: Row[] = [
      { id: "p1", group_id: null, sort_index: 100 },
      { id: "p2", group_id: null, sort_index: 200 },
      { id: "p3", group_id: "gA", sort_index: 100 },
      { id: "p4", group_id: "gA", sort_index: 200 },
      { id: "p5", group_id: "gB", sort_index: 100 },
    ]

    moveBucket(rows, "p1", "gA") // gA: p3 p4 p1
    moveBucket(rows, "p4", "gB") // gA: p3 p1 ; gB: p5 p4
    moveBucket(rows, "p3", null) // ungrouped: p2 p3 ; gA: p1
    reorder(rows, "p5", null) // gB unchanged (p5 already first)
    moveBucket(rows, "p2", "gB") // gB: p5 p4 p2
    reorder(rows, "p2", "p5") // gB: p5 p2 p4

    assertBucketsSane(rows)
    expect(orderOf(rows, "gA")).toEqual(["p1"])
    expect(orderOf(rows, "gB")).toEqual(["p5", "p2", "p4"])
    // ungrouped now holds only p3 (p2 moved out, p1 moved out earlier)
    expect(orderOf(rows, null)).toEqual(["p3"])
  })

  it("a bucket with no gaps re-spaces cleanly and the order survives", () => {
    const rows: Row[] = ["a", "b", "c"].map((id, i) => ({
      id,
      group_id: "gA",
      sort_index: i + 1, // 1, 2, 3 — no room between
    }))

    reorder(rows, "c", null) // want c a b — no gap → re-space to 100/200/300
    assertBucketsSane(rows)
    expect(orderOf(rows, "gA")).toEqual(["c", "a", "b"])
    expect(rows.map((r) => r.sort_index).sort((x, y) => x - y)).toEqual([
      100, 200, 300,
    ])
  })
})
