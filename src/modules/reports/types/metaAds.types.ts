export interface MetaAdsDailyRecord {
  date: string
  accountId: string
  accountLabel: string
  spend: number
  revenue: number
  purchases: number
  roas: number | null
}

export interface MetaAdsInsightsResponse {
  records: MetaAdsDailyRecord[]
  errors: { accountId: string; accountLabel: string; message: string }[]
}
