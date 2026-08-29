import { describe, expect, it, vi } from "vitest"

import {
  cellOf,
  parseSheetDate,
  readMappedSheet,
  resolveField,
  snapshotOf,
} from "@/modules/sheets-sync/services/sheetRows"

vi.mock("@/lib/server/google/sheets", () => ({
  readSheetValues: vi.fn(async () => [
    ["Mã", "Trạng thái", "Chủ đề"],
    ["V001", "quay_dung", "NYC"],
    ["", "chua_bat_dau", "bỏ qua"],
    ["V002", "chua_bat_dau", ""],
  ]),
}))

const cfg = {
  spreadsheet_id: "1abc",
  sheet_tab: "T",
  header_row: 1,
  column_map: { code: "Mã", status: "Trạng thái", topic: "Chủ đề" },
}

describe("readMappedSheet + snapshotOf", () => {
  it("finds the code column and lists data rows", async () => {
    const ctx = await readMappedSheet("tok", cfg)
    expect(ctx.headers).toEqual(["Mã", "Trạng thái", "Chủ đề"])
    expect(ctx.codeCol).toBe(0)
    expect(ctx.dataRows).toHaveLength(3)
  })

  it("snapshots the mapped cells by code, skipping code-less rows", async () => {
    const ctx = await readMappedSheet("tok", cfg)
    const snap = snapshotOf(ctx, cfg)
    expect(Object.keys(snap).sort()).toEqual(["V001", "V002"])
    expect(snap.V001).toEqual({ status: "quay_dung", topic: "NYC" })
    expect(snap.V002).toEqual({ status: "chua_bat_dau", topic: "" })
  })

  it("cellOf reads a mapped cell", async () => {
    const ctx = await readMappedSheet("tok", cfg)
    expect(cellOf(ctx, cfg, ctx.dataRows[0], "topic")).toBe("NYC")
    expect(cellOf(ctx, cfg, ctx.dataRows[0], "deadline")).toBe("")
  })
})

describe("resolveField (SPEC §5.5 R1)", () => {
  const names = new Map([["việt", "u-viet"]])

  it("accepts a valid status, rejects an invalid one", () => {
    expect(resolveField("status", "quay_dung", names)).toEqual({
      ok: true,
      patch: { status: "quay_dung" },
    })
    expect(resolveField("status", "đang làm", names)).toMatchObject({ ok: false })
  })

  it("content_format: valid / invalid / empty→null", () => {
    expect(resolveField("content_format", "reels", names)).toMatchObject({ ok: true })
    expect(resolveField("content_format", "tiktok", names)).toMatchObject({ ok: false })
    expect(resolveField("content_format", "", names)).toEqual({
      ok: true,
      patch: { content_format: null },
    })
  })

  it("deadline: parses / rejects / empty→null", () => {
    const r = resolveField("deadline", "15/09/2026", names)
    expect(r.ok).toBe(true)
    expect(resolveField("deadline", "hôm nào đó", names)).toMatchObject({ ok: false })
    expect(resolveField("deadline", "", names)).toEqual({
      ok: true,
      patch: { deadline: null },
    })
  })

  it("assignee: name match / no match / empty→null", () => {
    expect(resolveField("assignee", "Việt", names)).toEqual({
      ok: true,
      patch: { assignee_id: "u-viet" },
    })
    expect(resolveField("assignee", "Ai đó", names)).toMatchObject({ ok: false })
    expect(resolveField("assignee", "", names)).toEqual({
      ok: true,
      patch: { assignee_id: null },
    })
  })

  it("plain text: value / empty→null", () => {
    expect(resolveField("topic", "  NYC  ", names)).toEqual({
      ok: true,
      patch: { topic: "NYC" },
    })
    expect(resolveField("topic", "", names)).toEqual({
      ok: true,
      patch: { topic: null },
    })
  })
})

describe("parseSheetDate", () => {
  it("DD/MM/YYYY and YYYY-MM-DD pin to UTC midnight", () => {
    expect(parseSheetDate("31/12/2026")?.toISOString()).toBe(
      "2026-12-31T00:00:00.000Z"
    )
    expect(parseSheetDate("2026-09-01")?.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z"
    )
  })
  it("null for garbage", () => {
    expect(parseSheetDate("")).toBeNull()
    expect(parseSheetDate("next week")).toBeNull()
  })
})
