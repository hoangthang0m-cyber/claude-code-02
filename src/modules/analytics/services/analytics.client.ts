import { authedFetch, authedJson } from "@/lib/api/authedFetch"
import type {
  ComparedMetric,
  ContentStatus,
  MetricDelta,
  PeriodReport,
} from "@/lib/domain"

// Client wrappers for the analytics dashboard + report APIs (SPEC §5.6, tasks
// 8.1–8.6).

export interface ProgressDashboard {
  mode: "manager" | "staff"
  project_ids: string[]
  as_of: number
  total: number
  in_production: number
  pending_review: number
  overdue: number
  published: number
  ads_running: number
}

export function getDashboard() {
  return authedJson<ProgressDashboard>("/api/dashboard")
}

export interface PersonRow {
  user_id: string
  name: string
  in_progress: number
  completed_in_period: number
  overdue: number
  has_overdue: boolean
  avg_lead_time_ms: number | null
}

export interface PeopleResult {
  mode: "manager" | "staff"
  period: { from: number; to: number }
  people: PersonRow[]
}

export function getPeople(from?: number, to?: number) {
  const q = new URLSearchParams()
  if (from != null) q.set("from", String(from))
  if (to != null) q.set("to", String(to))
  const s = q.toString()
  return authedJson<PeopleResult>(`/api/dashboard/people${s ? `?${s}` : ""}`)
}

export type ReportKind = "week" | "month"

interface PeriodView {
  kind: ReportKind
  start: number
  end: number
  start_date: string
}

export interface ReportResult extends PeriodReport {
  mode: "manager" | "staff"
  period: PeriodView
}

export interface ComparisonResult {
  mode: "manager" | "staff"
  period: PeriodView
  previous_period: PeriodView
  current: PeriodReport
  previous: PeriodReport
  deltas: Record<ComparedMetric, MetricDelta>
}

export function getReport(kind: ReportKind, date: string) {
  return authedJson<ReportResult>(
    `/api/dashboard/report?period=${kind}&date=${date}`
  )
}

export function getComparison(kind: ReportKind, date: string) {
  return authedJson<ComparisonResult>(
    `/api/dashboard/report?period=${kind}&date=${date}&compare=1`
  )
}

export interface PersonItem {
  id: string
  code: string
  status: ContentStatus
  project_id: string
  deadline: number | null
  is_overdue: boolean
}

export function getPersonItems(userId: string, status?: string) {
  const q = status ? `?status=${status}` : ""
  return authedJson<{ items: PersonItem[] }>(
    `/api/dashboard/people/${userId}/items${q}`
  )
}

// Fetch a CSV export (needs the auth header) and hand it to the browser as a
// download.
export async function downloadCsv(url: string): Promise<void> {
  const res = await authedFetch(url)
  if (!res.ok) throw new Error(`Xuất thất bại (${res.status})`)
  const blob = await res.blob()
  const cd = res.headers.get("Content-Disposition") ?? ""
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? "export.csv"
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}
