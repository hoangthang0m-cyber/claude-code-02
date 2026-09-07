import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import type { AdReportSyncScope, SyncResult } from "@/lib/domain/enums"
import type { StatDate } from "@/lib/domain/adsSnapshot"

// ads-overview-reporting change, group 1 task 1.5. Reporting-wide settings, the
// per-account sync bookkeeping, and the currency rate table (design.md
// Decision 1 / 8).

// ── ReportingSettings — one system-wide document ───────────────────────────

// Fixed doc id: there is a single reporting configuration.
export const REPORTING_SETTINGS_DOC_ID = "default"

export interface ReportingSettings {
  id: string
  /** ISO 4217, e.g. "VND". Everything on the report is shown in this currency. */
  reporting_currency: string
  updated_at: Timestamp
  updated_by: string
}

export const reportingSettingsWriteSchema = z.object({
  reporting_currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Tiền tệ phải là mã ISO 3 chữ (vd VND, USD)"),
})

export type ReportingSettingsWrite = z.infer<
  typeof reportingSettingsWriteSchema
>

export const DEFAULT_REPORTING_CURRENCY = "VND"

// ── CurrencyRate ──────────────────────────────────────────────────────────

// Manager-entered conversion rate; there is no automatic FX (design.md
// Non-Goals). `rate` multiplies an amount in `from_currency` to get
// `to_currency`. `effective_from` lets a historical day use the rate that was
// current then.
export interface CurrencyRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  effective_from: StatDate
  entered_by: string
  created_at: Timestamp
}

export const currencyRateWriteSchema = z.object({
  from_currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  to_currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  rate: z.number().positive(),
  effective_from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "effective_from phải là YYYY-MM-DD"),
})

export type CurrencyRateWrite = z.infer<typeof currencyRateWriteSchema>

export interface CurrencyRateView {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  effective_from: StatDate
}

export function currencyRateId(
  from: string,
  to: string,
  effectiveFrom: StatDate
): string {
  return `${from}__${to}__${effectiveFrom}`
}

// ── AdAccountReportSyncState — one row per (account, scope) ─────────────────

export interface AdAccountReportSyncState {
  id: string
  ad_account_id: string
  scope: AdReportSyncScope
  last_full_sync_at: Timestamp | null
  earliest_synced_date: StatDate | null
  latest_synced_date: StatDate | null
  last_result: SyncResult
  message: string | null
  updated_at: Timestamp
}

export function adAccountReportSyncStateId(
  adAccountId: string,
  scope: AdReportSyncScope
): string {
  return `${adAccountId}__${scope}`
}
