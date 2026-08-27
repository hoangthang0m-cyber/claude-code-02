import { z } from "zod"

import { ADS_OBJECT_LEVELS, type AdsObjectLevel } from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: AdsBinding (id, content_item_id, ad_account_id,
//   object_level: campaign | adset | ad, object_id)
//
// A content item can have several bindings; metrics are aggregated on read
// (SPEC §5.4 R2, §6.4). The "stopped updating" state after an unlink
// (SPEC §5.4 R2) is added in task 5.3.

export interface AdsBinding {
  id: string
  content_item_id: string
  ad_account_id: string
  object_level: AdsObjectLevel
  object_id: string
}

export const adsBindingWriteSchema = z.object({
  content_item_id: idString,
  ad_account_id: idString,
  object_level: z.enum(ADS_OBJECT_LEVELS),
  object_id: idString,
})

export type AdsBindingWrite = z.infer<typeof adsBindingWriteSchema>
