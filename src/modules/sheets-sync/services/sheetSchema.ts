// sheets-sync-fixed-schema change §2 — recognise sheet columns by a fixed set of
// standard names, no manual column mapping. Header cells are normalised
// (diacritics stripped, lowercased, spaces collapsed) and matched against an
// alias dictionary.

// task 2.1 — normalise a header (or any label) for comparison.
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritics
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

// task 2.2 — the standard column set. Aliases are already in normalised form.
// `ads_report_note` (design.md Decision 7) is free text read from the "Báo cáo
// hiệu quả ads" column, kept separate from the Meta AdsMetric numbers.
export const SHEET_COLUMN_ALIASES = {
  code: ["ma", "ma hang muc", "ma video"],
  deadline: ["deadline", "han", "han hoan thanh"],
  assignee: ["nhan su thuc hien", "nhan su", "nguoi thuc hien"],
  script_url: ["kich ban", "link kich ban"],
  video_url: ["link video", "video"],
  status: ["trang thai"],
  topic: ["chu de"],
  content_format: ["dinh dang"],
  customer_research_url: [
    "link research khach hang",
    "research kh",
    "link research",
  ],
  ads_report_note: ["bao cao hieu qua ads", "bao cao ads"],
  evaluation: ["danh gia/de xuat", "danh gia de xuat", "danh gia", "de xuat"],
} as const

export type SheetColumnField = keyof typeof SHEET_COLUMN_ALIASES

export const SHEET_COLUMN_FIELDS = Object.keys(
  SHEET_COLUMN_ALIASES
) as SheetColumnField[]

export interface RecognizedColumns {
  /** field → 0-based column index in the header row */
  columns: Partial<Record<SheetColumnField, number>>
  recognized: SheetColumnField[]
  /** standard fields whose column was not found */
  missing: SheetColumnField[]
  /** e.g. two columns matched the same field */
  warnings: string[]
}

// task 2.2 — map a header row to { field: columnIndex }. Order of columns in the
// sheet does not matter. A cell that matches no alias is ignored (no error).
// When two columns match the same field, the left-most wins + a warning.
export function recognizeColumns(
  header: readonly string[]
): RecognizedColumns {
  const columns: Partial<Record<SheetColumnField, number>> = {}
  const warnings: string[] = []

  header.forEach((cell, idx) => {
    const norm = normalizeHeader(cell ?? "")
    if (!norm) return
    for (const field of SHEET_COLUMN_FIELDS) {
      if ((SHEET_COLUMN_ALIASES[field] as readonly string[]).includes(norm)) {
        if (columns[field] != null) {
          warnings.push(
            `Cột "${cell.trim()}" cũng khớp trường "${field}" — dùng cột trái nhất`
          )
        } else {
          columns[field] = idx
        }
        break
      }
    }
  })

  return {
    columns,
    recognized: SHEET_COLUMN_FIELDS.filter((f) => columns[f] != null),
    missing: SHEET_COLUMN_FIELDS.filter((f) => columns[f] == null),
    warnings,
  }
}
