import { describe, expect, it } from "vitest"

import { toCsv } from "@/lib/csv"

const stripBom = (s: string) => s.replace(/^﻿/, "")

describe("toCsv (SPEC §5.6 R5, task 8.5)", () => {
  it("writes rows joined by CRLF, cells by comma", () => {
    expect(stripBom(toCsv([["a", "b"], ["c", "d"]]))).toBe("a,b\r\nc,d\r\n")
  })

  it("prepends a UTF-8 BOM so Excel reads Vietnamese", () => {
    expect(toCsv([["Nhân sự"]]).charCodeAt(0)).toBe(0xfeff)
  })

  it("quotes only cells containing a comma, quote or newline; doubles inner quotes", () => {
    const out = stripBom(
      toCsv([["plain", "a,b", 'has "q"', "line\nbreak"]])
    )
    expect(out).toBe('plain,"a,b","has ""q""","line\nbreak"\r\n')
  })

  it("renders null / undefined as empty, keeps numbers and booleans", () => {
    expect(stripBom(toCsv([[null, undefined, 0, 3.5, false]]))).toBe(
      ",,0,3.5,false\r\n"
    )
  })
})
