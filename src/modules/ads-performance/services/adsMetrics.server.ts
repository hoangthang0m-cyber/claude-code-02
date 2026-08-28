import { FieldValue, Timestamp } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  adsMetricManualSchema,
  type AdsMetricView,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { parseOrThrow } from "@/lib/server/validate"
import { loadContentItem } from "@/modules/content-pipeline/services/content.server"

// SPEC §5.4 R4: a manager types ad figures for a content item; the row is
// labelled `source=manual`. AdsMetric is append-only (§6.1), so a manual entry
// never overwrites anything.
//
// Display priority (§6.1): the current value is the latest `synced` row; only
// when no synced row has ever been written does the latest `manual` row show.

function ms(value: unknown): number | null {
  const t = value as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : null
}

function toView(id: string, d: Record<string, unknown>): AdsMetricView {
  return {
    id,
    source: d.source === "manual" ? "manual" : "synced",
    spend: Number(d.spend ?? 0),
    messages: Number(d.messages ?? 0),
    cost_per_purchase: Number(d.cost_per_purchase ?? 0),
    roas: Number(d.roas ?? 0),
    ctr: Number(d.ctr ?? 0),
    ads_started_on: ms(d.ads_started_on),
    delivery_status:
      (d.delivery_status as AdsMetricView["delivery_status"]) ?? "unknown",
    data_as_of: ms(d.data_as_of),
    captured_at: ms(d.captured_at),
  }
}

export async function enterManualMetric(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<{ id: string }> {
  const { data } = await loadContentItem(contentItemId)
  const scope = await requireProjectScope(actor.uid, data.project_id)
  requireProjectManager(scope)
  await assertProjectWritable(data.project_id)

  const input = parseOrThrow(adsMetricManualSchema, body)

  const ref = getAdminDb().collection(COLLECTIONS.adsMetrics).doc()
  await ref.set({
    content_item_id: contentItemId,
    source: "manual",
    spend: input.spend,
    messages: input.messages,
    cost_per_purchase: input.cost_per_purchase,
    roas: input.roas,
    ctr: input.ctr,
    ads_started_on: input.ads_started_on
      ? Timestamp.fromDate(new Date(input.ads_started_on))
      : null,
    delivery_status: input.delivery_status,
    data_as_of: input.data_as_of
      ? Timestamp.fromDate(new Date(input.data_as_of))
      : FieldValue.serverTimestamp(),
    captured_at: FieldValue.serverTimestamp(),
  })
  return { id: ref.id }
}

// SPEC §6.1 / §5.4 R4: latest synced wins; fall back to latest manual only when
// no synced row exists. `history` keeps every row (manual entries stay visible
// after a sync succeeds).
export async function getContentMetrics(
  actor: AuthedUser,
  contentItemId: string
): Promise<{
  current: AdsMetricView | null
  source: "synced" | "manual" | null
  history: AdsMetricView[]
}> {
  const { data } = await loadContentItem(contentItemId)
  await requireProjectScope(actor.uid, data.project_id)

  const snap = await getAdminDb()
    .collection(COLLECTIONS.adsMetrics)
    .where("content_item_id", "==", contentItemId)
    .get()

  const rows = snap.docs
    .map((d) => toView(d.id, d.data()))
    .sort((a, b) => (b.captured_at ?? 0) - (a.captured_at ?? 0))

  const latestSynced = rows.find((r) => r.source === "synced")
  const current = latestSynced ?? rows.find((r) => r.source === "manual") ?? null

  return {
    current,
    source: current ? current.source : null,
    history: rows,
  }
}
