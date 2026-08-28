import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { ADS_OBJECT_LEVELS, type AdsObjectLevel } from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: AdsBinding (id, content_item_id, ad_account_id,
//   object_level: campaign | adset | ad, object_id)
//
// A content item can have several bindings; metrics are aggregated on read
// (SPEC §5.4 R2, §6.4). Unbinding does NOT delete the row (SPEC §5.4 R2: "giữ
// số liệu lịch sử, đánh dấu đã ngừng cập nhật") — it flips `active` to false and
// stamps `unbound_at`, so the sync job (task 5.4) skips it while the history and
// its AdsMetric rows stay intact.

export interface AdsBinding {
  id: string
  content_item_id: string
  ad_account_id: string
  object_level: AdsObjectLevel
  object_id: string
  active: boolean
  created_at: Timestamp
  unbound_at?: Timestamp | null
}

// Bind request (SPEC §5.4 R2). `content_item_id` comes from the URL.
export const adsBindingCreateSchema = z.object({
  ad_account_id: idString,
  object_level: z.enum(ADS_OBJECT_LEVELS),
  object_id: idString,
})

export type AdsBindingCreate = z.infer<typeof adsBindingCreateSchema>

// A binding as the client sees it.
export interface AdsBindingView {
  id: string
  ad_account_id: string
  object_level: AdsObjectLevel
  object_id: string
  active: boolean
  unbound_at: number | null
}

export function adsBindingDocId(
  contentItemId: string,
  objectId: string
): string {
  return `${contentItemId}__${objectId}`
}

// SPEC §5.4 R2 / §6.4: only active bindings are synced.
export function isBindingSyncable(binding: { active?: boolean }): boolean {
  return binding.active !== false
}
