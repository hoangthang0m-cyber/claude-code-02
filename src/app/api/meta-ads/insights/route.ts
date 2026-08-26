import { META_ADS_ACCOUNTS, type MetaAdsAccount } from "@/constants/metaAdsAccounts"
import type { MetaAdsDailyRecord, MetaAdsInsightsResponse } from "@/modules/reports/types/metaAds.types"

export const dynamic = "force-dynamic"

const GRAPH_API_VERSION = "v21.0"
const PURCHASE_ACTION_TYPE = "omni_purchase"

interface FacebookActionEntry {
  action_type: string
  value: string
}

interface FacebookInsightsRow {
  date_start: string
  spend?: string
  actions?: FacebookActionEntry[]
  action_values?: FacebookActionEntry[]
  purchase_roas?: FacebookActionEntry[]
}

async function fetchAccountInsights(
  account: MetaAdsAccount,
  accessToken: string,
  datePreset: string
): Promise<{ account: MetaAdsAccount; error: string | null; records: MetaAdsDailyRecord[] }> {
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/act_${account.id}/insights`)
    url.searchParams.set("fields", "spend,actions,action_values,purchase_roas")
    url.searchParams.set("date_preset", datePreset)
    url.searchParams.set("time_increment", "1")
    url.searchParams.set("access_token", accessToken)

    const res = await fetch(url, { cache: "no-store" })
    const json = await res.json()

    if (json.error) {
      return { account, error: json.error.message as string, records: [] }
    }

    const rows = (json.data ?? []) as FacebookInsightsRow[]
    const records: MetaAdsDailyRecord[] = rows.map((row) => {
      const spend = Number(row.spend ?? 0)
      const purchaseAction = row.actions?.find((a) => a.action_type === PURCHASE_ACTION_TYPE)
      const purchaseValue = row.action_values?.find((a) => a.action_type === PURCHASE_ACTION_TYPE)
      const roasEntry = row.purchase_roas?.find((a) => a.action_type === PURCHASE_ACTION_TYPE)
      const revenue = Number(purchaseValue?.value ?? 0)

      return {
        date: row.date_start,
        accountId: account.id,
        accountLabel: account.label,
        spend,
        revenue,
        purchases: Number(purchaseAction?.value ?? 0),
        roas: roasEntry ? Number(roasEntry.value) : spend > 0 ? revenue / spend : null,
      }
    })

    return { account, error: null, records }
  } catch (err) {
    return {
      account,
      error: err instanceof Error ? err.message : "Không gọi được Facebook API.",
      records: [],
    }
  }
}

export async function GET(request: Request) {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN
  if (!accessToken) {
    const response: MetaAdsInsightsResponse = {
      records: [],
      errors: [
        {
          accountId: "",
          accountLabel: "",
          message: "Chưa cấu hình FACEBOOK_ACCESS_TOKEN trên server.",
        },
      ],
    }
    return Response.json(response, { status: 200 })
  }

  const { searchParams } = new URL(request.url)
  const datePreset = searchParams.get("datePreset") ?? "last_30d"

  const results = await Promise.all(
    META_ADS_ACCOUNTS.map((account) => fetchAccountInsights(account, accessToken, datePreset))
  )

  const response: MetaAdsInsightsResponse = {
    records: results.flatMap((r) => r.records),
    errors: results
      .filter((r) => r.error)
      .map((r) => ({
        accountId: r.account.id,
        accountLabel: r.account.label,
        message: r.error as string,
      })),
  }

  return Response.json(response)
}
