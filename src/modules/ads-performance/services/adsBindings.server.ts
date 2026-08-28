import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  adsBindingCreateSchema,
  adsBindingDocId,
  type AdsBindingView,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import { loadContentItem } from "@/modules/content-pipeline/services/content.server"

// SPEC §5.4 R2, §6.4: bind a content item to one or more Meta ad objects
// (campaign / ad set / ad). Manager-only (SPEC §2). Unbinding is a soft delete —
// the row stays, `active` flips to false, `unbound_at` is stamped — so the sync
// job stops touching it while historical AdsMetric rows are untouched.

async function requireContentManager(
  actor: AuthedUser,
  contentItemId: string
): Promise<{ projectId: string }> {
  const { data } = await loadContentItem(contentItemId)
  const scope = await requireProjectScope(actor.uid, data.project_id)
  requireProjectManager(scope)
  await assertProjectWritable(data.project_id)
  return { projectId: data.project_id }
}

export async function bindAd(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<{ id: string }> {
  await requireContentManager(actor, contentItemId)
  const input = parseOrThrow(adsBindingCreateSchema, body)
  const db = getAdminDb()

  // The ad account must be one the acting manager has connected (SPEC §5.4 R2:
  // "thuộc Ad Account đã kết nối").
  const conn = await db
    .collection(COLLECTIONS.adAccountConnections)
    .doc(`${actor.uid}__${input.ad_account_id}`)
    .get()
  if (!conn.exists) {
    throw new HttpError(400, "Ad Account chưa được kết nối")
  }
  if (conn.data()?.state === "needs_reconnect") {
    throw new HttpError(409, "Ad Account cần kết nối lại trước khi gắn")
  }

  const id = adsBindingDocId(contentItemId, input.object_id)
  await db
    .collection(COLLECTIONS.adsBindings)
    .doc(id)
    .set(
      {
        content_item_id: contentItemId,
        ad_account_id: input.ad_account_id,
        object_level: input.object_level,
        object_id: input.object_id,
        active: true,
        unbound_at: null,
        created_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  return { id }
}

export async function unbindAd(
  actor: AuthedUser,
  contentItemId: string,
  objectId: string
): Promise<{ id: string; active: false }> {
  await requireContentManager(actor, contentItemId)
  const db = getAdminDb()
  const ref = db
    .collection(COLLECTIONS.adsBindings)
    .doc(adsBindingDocId(contentItemId, objectId))
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.content_item_id !== contentItemId) {
    throw new HttpError(404, "Không tìm thấy liên kết quảng cáo")
  }

  // Soft delete only — keep the row and its AdsMetric history (SPEC §5.4 R2).
  await ref.update({
    active: false,
    unbound_at: FieldValue.serverTimestamp(),
  })
  return { id: ref.id, active: false }
}

export async function listAdsBindings(
  actor: AuthedUser,
  contentItemId: string
): Promise<{ bindings: AdsBindingView[] }> {
  const { data } = await loadContentItem(contentItemId)
  await requireProjectScope(actor.uid, data.project_id)

  const snap = await getAdminDb()
    .collection(COLLECTIONS.adsBindings)
    .where("content_item_id", "==", contentItemId)
    .get()

  const ms = (v: unknown): number | null => {
    const t = v as { toMillis?: () => number } | undefined
    return typeof t?.toMillis === "function" ? t.toMillis() : null
  }
  const bindings = snap.docs
    .map(
      (d) =>
        ({
          id: d.id,
          ad_account_id: String(d.data().ad_account_id ?? ""),
          object_level: d.data().object_level,
          object_id: String(d.data().object_id ?? ""),
          active: d.data().active !== false,
          unbound_at: ms(d.data().unbound_at),
          sync_error_since: ms(d.data().sync_error_since),
        }) as AdsBindingView
    )
    .sort((a, b) => Number(b.active) - Number(a.active))

  return { bindings }
}
