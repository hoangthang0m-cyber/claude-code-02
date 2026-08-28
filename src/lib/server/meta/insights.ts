import type { AdsDeliveryStatus } from "@/lib/domain"
import {
  classifyMetaError,
  metaNetworkError,
} from "@/lib/server/meta/errors"
import { META_GRAPH_VERSION } from "@/lib/server/meta/graph"

// Meta Insights + delivery status for one ad object (SPEC §5.4 R3, §6.4). Q1
// answers: Mess = messaging_conversation_started (Meta default attribution),
// CPP = cost per omni_purchase.

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

const MESSAGE_ACTIONS = new Set([
  "messaging_conversation_started",
  "onsite_conversion.messaging_conversation_started_7d",
])
const PURCHASE_ACTIONS = new Set(["omni_purchase", "purchase"])

export interface AdObjectInsights {
  object_id: string
  spend: number
  messages: number
  purchases: number
  /** cost per purchase (Q1); 0 when there are no purchases */
  cost_per_purchase: number
  roas: number
  ctr: number
  /** ISO date of the first day with delivery, if known */
  ads_started_on: string | null
}

type Fetch = typeof fetch
interface ActionEntry {
  action_type: string
  value: string
}

function sumActions(rows: ActionEntry[] | undefined, match: Set<string>): number {
  if (!rows) return 0
  return rows
    .filter((a) => match.has(a.action_type))
    .reduce((n, a) => n + Number(a.value ?? 0), 0)
}

function firstAction(
  rows: ActionEntry[] | undefined,
  match: Set<string>
): number {
  const hit = rows?.find((a) => match.has(a.action_type))
  return hit ? Number(hit.value ?? 0) : 0
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
  if (!json) {
    throw classifyMetaError(null, res.status || 502, context)
  }
  return json
}

// SPEC §6.4: lifetime cumulative snapshot per sync (date_preset=maximum); the
// AdsMetric row records `data_as_of = now`.
export async function fetchAdObjectInsights(
  objectId: string,
  token: string,
  fetchImpl: Fetch = fetch
): Promise<AdObjectInsights> {
  const url = new URL(`${GRAPH}/${objectId}/insights`)
  url.searchParams.set(
    "fields",
    "spend,actions,cost_per_action_type,purchase_roas,ctr,date_start"
  )
  url.searchParams.set("date_preset", "maximum")
  url.searchParams.set("access_token", token)

  const json = await graphGet(fetchImpl, url.toString(), "insights")
  const row = (Array.isArray(json.data) ? json.data[0] : undefined) as
    | Record<string, unknown>
    | undefined

  if (!row) {
    return {
      object_id: objectId,
      spend: 0,
      messages: 0,
      purchases: 0,
      cost_per_purchase: 0,
      roas: 0,
      ctr: 0,
      ads_started_on: null,
    }
  }

  const spend = Number(row.spend ?? 0)
  const messages = sumActions(row.actions as ActionEntry[], MESSAGE_ACTIONS)
  const purchases = sumActions(row.actions as ActionEntry[], PURCHASE_ACTIONS)
  const cppEntry = firstAction(
    row.cost_per_action_type as ActionEntry[],
    PURCHASE_ACTIONS
  )
  return {
    object_id: objectId,
    spend,
    messages,
    purchases,
    cost_per_purchase:
      cppEntry > 0 ? cppEntry : purchases > 0 ? spend / purchases : 0,
    roas: firstAction(row.purchase_roas as ActionEntry[], PURCHASE_ACTIONS),
    ctr: Number(row.ctr ?? 0),
    ads_started_on: typeof row.date_start === "string" ? row.date_start : null,
  }
}

// SPEC §5.4 R3: "trạng thái phân phối của ad (đang chạy / tạm dừng / hoàn tất)".
// From the object's effective_status, not from /insights.
export async function fetchDeliveryStatus(
  objectId: string,
  token: string,
  fetchImpl: Fetch = fetch
): Promise<AdsDeliveryStatus> {
  const url = new URL(`${GRAPH}/${objectId}`)
  url.searchParams.set("fields", "effective_status")
  url.searchParams.set("access_token", token)
  const json = await graphGet(fetchImpl, url.toString(), "trạng thái")
  return mapEffectiveStatus(String(json.effective_status ?? ""))
}

export function mapEffectiveStatus(status: string): AdsDeliveryStatus {
  const s = status.toUpperCase()
  if (s === "ACTIVE") return "active"
  if (s.includes("PAUSED") || s === "IN_PROCESS" || s === "PENDING_REVIEW") {
    return "paused"
  }
  if (s === "ARCHIVED" || s === "DELETED" || s === "COMPLETED") return "completed"
  return "unknown"
}
