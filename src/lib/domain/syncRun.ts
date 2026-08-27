import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  SYNC_KINDS,
  SYNC_RESULTS,
  type SyncKind,
  type SyncResult,
} from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: SyncRun (id, project_id, kind: sheets | ads, started_at,
//   finished_at, result: ok | warning | error, rows_read, rows_written,
//   message)
//
// Written only by the sync jobs (groups 7.5 / 7.6). `finished_at` and `result`
// are absent while a run is in progress. Surfaced on the project's sync log
// screen (SPEC §5.5 R4).

export interface SyncRun {
  id: string
  project_id: string
  kind: SyncKind
  started_at: Timestamp
  finished_at?: Timestamp
  result?: SyncResult
  rows_read: number
  rows_written: number
  message?: string
}

export const syncRunWriteSchema = z.object({
  project_id: idString,
  kind: z.enum(SYNC_KINDS),
  result: z.enum(SYNC_RESULTS).optional(),
  rows_read: z.number().int().nonnegative().default(0),
  rows_written: z.number().int().nonnegative().default(0),
  message: z.string().trim().optional(),
})

export type SyncRunWrite = z.infer<typeof syncRunWriteSchema>
