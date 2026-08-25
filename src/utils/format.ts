const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
})

export function formatCurrency(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—"
  return currencyFormatter.format(value)
}

export function formatCompactNumber(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—"
  if (Math.abs(value) < 1000) return String(value)
  return new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  )
}

export function formatRoas(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—"
  return `${value.toFixed(2)}x`
}
