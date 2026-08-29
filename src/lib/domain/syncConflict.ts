import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  SYNC_CONFLICT_SIDES,
  type SyncConflictSide,
} from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: SyncConflict (id, project_id, content_item_id, field,
//   system_value, sheet_value, chosen_side, created_at)
//
// Recorded when the same field of the same content item changed on both sides
// between two sync runs (SPEC §5.5 R3). `system_value` / `sheet_value` hold the
// serialised (string) representation of each side's value for the log.
// created_at is server-set.

export interface SyncConflict {
  id: string
  project_id: string
  content_item_id: string
  field: string
  system_value: string
  sheet_value: string
  chosen_side: SyncConflictSide
  created_at: Timestamp
}

export const syncConflictWriteSchema = z.object({
  project_id: idString,
  content_item_id: idString,
  field: z.string().trim().min(1),
  system_value: z.string(),
  sheet_value: z.string(),
  chosen_side: z.enum(SYNC_CONFLICT_SIDES),
})

export type SyncConflictWrite = z.infer<typeof syncConflictWriteSchema>
