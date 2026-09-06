import { classifyMetaError, metaNetworkError } from "@/lib/server/meta/errors"
import { META_GRAPH_VERSION } from "@/lib/server/meta/graph"

// ads-overview-reporting change, group 3 tasks 3.1 / 3.2 / 3.3. Meta Insights
// reads for the product report: campaign × day and ad × day time series, plus a
// period-level reach query. Revenue / purchases come from the `omni_purchase`
// action (design.md Decision 3).

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`
const PURCHASE_ACTIONS = new Set(["omni_purchase", "purchase"])
const MAX_PAGES = 120

type Fetch = typeof fetch

interface ActionEntry {
  action_type?: string
  value?: string | number
}

function sumActions(rows: unknown, match: Set<string>): number {
  if (!Array.isArray(rows)) return 0
  return (rows as ActionEntry[])
    .filter((a) => a.action_type != null && match.has(a.action_type))
    .reduce((n, a) => n + Number(a.value ?? 0), 0)
}

// Total of an action-array field (video_play_actions etc.) regardless of
// action_type — Meta returns a single "video_view" entry but be defensive.
function sumAll(rows: unknown): number {
  if (!Array.isArray(rows)) return 0
  return (rows as ActionEntry[]).reduce((n, a) => n + Number(a.value ?? 0), 0)
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function graphGet(
  fetchImpl: Fetch,
  url: string,
  context: string
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetchImpl(url, { cache: "no-store" })
  } catch {
    throw metaNetworkError(context)
  }
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!res.ok || (json && json.error)) {
    throw classifyMetaError(json, res.status, context)
  }
  if (!json) throw classifyMetaError(null, res.status || 502, context)
  return json
}

// follow `paging.next` (a full URL) until it runs out
async function getAllPages(
  fetchImpl: Fetch,
  firstUrl: string,
  context: string
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let url: string | undefined = firstUrl
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const json: Record<string, unknown> = await graphGet(fetchImpl, url, context)
    if (Array.isArray(json.data)) {
      out.push(...(json.data as Record<string, unknown>[]))
    }
    const paging = json.paging as { next?: string } | undefined
    url = paging?.next
  }
  return out
}

// ── 3.1 campaign × day ────────────────────────────────────────────────────

export interface CampaignDayInsight {
  campaign_id: string
  campaign_name: string
  objective: string
  stat_date: string
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
}

export async function fetchCampaignInsights(
  adAccountId: string,
  token: string,
  since: string,
  until: string,
  fetchImpl: Fetch = fetch
): Promise<CampaignDayInsight[]> {
  const url = new URL(`${GRAPH}/act_${adAccountId}/insights`)
  url.searchParams.set("level", "campaign")
  url.searchParams.set("time_increment", "1")
  url.searchParams.set("time_range", JSON.stringify({ since, until }))
  url.searchParams.set(
    "fields",
    "campaign_id,campaign_name,objective,spend,impressions,clicks,actions,action_values"
  )
  url.searchParams.set("limit", "500")
  url.searchParams.set("access_token", token)

  const rows = await getAllPages(fetchImpl, url.toString(), "insights campaign")
  return rows.map((r) => ({
    campaign_id: String(r.campaign_id ?? ""),
    campaign_name: String(r.campaign_name ?? ""),
    objective: String(r.objective ?? ""),
    stat_date: String(r.date_start ?? ""),
    spend: num(r.spend),
    revenue: sumActions(r.action_values, PURCHASE_ACTIONS),
    purchases: sumActions(r.actions, PURCHASE_ACTIONS),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
  }))
}

// ── 3.2 ad × day (only the ad ids passed in) ──────────────────────────────

export interface AdDayInsight {
  ad_id: string
  ad_name: string
  campaign_id: string
  stat_date: string
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
  video_plays: number
  video_3s_plays: number
  video_p100_plays: number
}

export async function fetchAdInsights(
  adAccountId: string,
  token: string,
  adIds: readonly string[],
  since: string,
  until: string,
  fetchImpl: Fetch = fetch
): Promise<AdDayInsight[]> {
  const ids = [...new Set(adIds)].filter(Boolean)
  if (ids.length === 0) return []

  const url = new URL(`${GRAPH}/act_${adAccountId}/insights`)
  url.searchParams.set("level", "ad")
  url.searchParams.set("time_increment", "1")
  url.searchParams.set("time_range", JSON.stringify({ since, until }))
  url.searchParams.set(
    "filtering",
    JSON.stringify([{ field: "ad.id", operator: "IN", value: ids }])
  )
  url.searchParams.set(
    "fields",
    "ad_id,ad_name,campaign_id,spend,impressions,clicks,actions,action_values," +
      "video_play_actions,video_3_sec_watched_actions,video_p100_watched_actions"
  )
  url.searchParams.set("limit", "500")
  url.searchParams.set("access_token", token)

  const rows = await getAllPages(fetchImpl, url.toString(), "insights ad")
  return rows.map((r) => ({
    ad_id: String(r.ad_id ?? ""),
    ad_name: String(r.ad_name ?? ""),
    campaign_id: String(r.campaign_id ?? ""),
    stat_date: String(r.date_start ?? ""),
    spend: num(r.spend),
    revenue: sumActions(r.action_values, PURCHASE_ACTIONS),
    purchases: sumActions(r.actions, PURCHASE_ACTIONS),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    video_plays: sumAll(r.video_play_actions),
    video_3s_plays: sumAll(r.video_3_sec_watched_actions),
    video_p100_plays: sumAll(r.video_p100_watched_actions),
  }))
}

// ── 3.3 reach for one ad over a period (NOT summed by day) ────────────────

// Meta de-duplicates people, so reach cannot be added across daily snapshots
// (design.md Decision 3). This queries the whole period in one shot.
export async function fetchAdReach(
  adId: string,
  token: string,
  since: string,
  until: string,
  fetchImpl: Fetch = fetch
): Promise<number> {
  const url = new URL(`${GRAPH}/${adId}/insights`)
  url.searchParams.set("fields", "reach")
  url.searchParams.set("time_range", JSON.stringify({ since, until }))
  url.searchParams.set("access_token", token)
  const json = await graphGet(fetchImpl, url.toString(), "reach")
  const row = (Array.isArray(json.data) ? json.data[0] : undefined) as
    | Record<string, unknown>
    | undefined
  return num(row?.reach)
}

// Per-(ad, period) reach cache. Keyed by ad id + exact window so a different
// period always re-queries (design.md "Cache theo (ad, kỳ)").
export class ReachCache {
  private readonly hits = new Map<string, number>()

  constructor(
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  private key(adId: string, since: string, until: string): string {
    return `${adId}__${since}__${until}`
  }

  async get(adId: string, since: string, until: string): Promise<number> {
    const k = this.key(adId, since, until)
    const cached = this.hits.get(k)
    if (cached !== undefined) return cached
    const reach = await fetchAdReach(adId, this.token, since, until, this.fetchImpl)
    this.hits.set(k, reach)
    return reach
  }
}
