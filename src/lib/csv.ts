// Minimal RFC-4180 CSV writer. A cell is quoted only when it must be (contains
// a comma, a quote or a newline); inner quotes are doubled. A UTF-8 BOM is
// prepended so Excel opens Vietnamese text correctly — this is the "CSV hoặc
// Excel" export (SPEC §5.6 R5, task 8.5).

export type CsvCell = string | number | boolean | null | undefined

function cell(value: CsvCell): string {
  if (value == null) return ""
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  const body = rows.map((r) => r.map(cell).join(",")).join("\r\n")
  return `﻿${body}\r\n`
}

// A downloadable CSV response for a route handler.
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  })
}
