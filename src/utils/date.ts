import type { Timestamp } from "firebase/firestore"

export function formatDate(timestamp?: Timestamp): string {
  if (!timestamp) return "—"
  return timestamp.toDate().toLocaleDateString("vi-VN")
}

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-")
  if (!year || !monthNumber) return month
  return `Tháng ${Number(monthNumber)}/${year}`
}
