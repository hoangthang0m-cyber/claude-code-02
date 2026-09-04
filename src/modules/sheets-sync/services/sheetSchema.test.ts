import { describe, expect, it } from "vitest"

import {
  normalizeHeader,
  recognizeColumns,
} from "@/modules/sheets-sync/services/sheetSchema"

// sheets-sync-fixed-schema tasks 2.1 / 2.2.

describe("normalizeHeader (task 2.1)", () => {
  it("strips Vietnamese diacritics, lowercases, trims, collapses spaces", () => {
    expect(normalizeHeader("CHỦ ĐỀ")).toBe("chu de")
    expect(normalizeHeader("  Nhân sự  thực hiện ")).toBe("nhan su thuc hien")
    expect(normalizeHeader("deadline")).toBe("deadline")
    expect(normalizeHeader("Mã hạng mục")).toBe("ma hang muc")
    expect(normalizeHeader("Đánh giá/Đề xuất")).toBe("danh gia/de xuat")
  })
})

describe("recognizeColumns (task 2.2)", () => {
  it("matches the standard set regardless of case, diacritics, spacing, order", () => {
    const r = recognizeColumns([
      "chủ đề",
      "MÃ",
      "Trạng Thái",
      " Nhân sự thực hiện ",
      "Deadline",
    ])
    expect(r.columns).toEqual({
      topic: 0,
      code: 1,
      status: 2,
      assignee: 3,
      deadline: 4,
    })
    expect(r.recognized).toEqual(
      expect.arrayContaining(["code", "status", "assignee", "topic", "deadline"])
    )
  })

  it("accepts the short 'Nhân sự' alias and 'Báo cáo hiệu quả ads'", () => {
    const r = recognizeColumns(["Mã", "Nhân sự", "Báo cáo hiệu quả ads"])
    expect(r.columns.assignee).toBe(1)
    expect(r.columns.ads_report_note).toBe(2)
  })

  it("ignores a column that matches no alias (no error)", () => {
    const r = recognizeColumns(["Mã", "Ghi chú nội bộ", "Trạng thái"])
    expect(r.columns).toEqual({ code: 0, status: 2 })
    expect(r.warnings).toEqual([])
  })

  it("two columns matching one field → left-most wins + a warning", () => {
    const r = recognizeColumns(["Mã", "Trạng thái", "trang thai"])
    expect(r.columns.status).toBe(1)
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toMatch(/trang thai/i)
  })

  it("reports the standard fields whose column was not found", () => {
    const r = recognizeColumns(["Mã", "Trạng thái"])
    expect(r.missing).toEqual(
      expect.arrayContaining(["deadline", "assignee", "topic", "video_url"])
    )
    expect(r.missing).not.toContain("code")
  })

  it("a header with no 'Mã' column → code is absent (caller aborts sheet→system)", () => {
    const r = recognizeColumns(["Deadline", "Trạng thái"])
    expect(r.columns.code).toBeUndefined()
    expect(r.missing).toContain("code")
  })
})
