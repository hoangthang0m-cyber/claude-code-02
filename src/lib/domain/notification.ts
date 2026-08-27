import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: Notification (id, recipient_id, type, content_item_id nullable,
//   project_id nullable, message, read_at nullable, created_at)
//
// Created by the notification engine (group 7.7) from the event → recipient
// table in SPEC §5.7 R1. read_at is set when the recipient opens it. created_at
// is server-set.

export interface Notification {
  id: string
  recipient_id: string
  type: NotificationType
  content_item_id?: string
  project_id?: string
  message: string
  read_at?: Timestamp
  created_at: Timestamp
}

export const notificationWriteSchema = z.object({
  recipient_id: idString,
  type: z.enum(NOTIFICATION_TYPES),
  content_item_id: idString.nullable().optional(),
  project_id: idString.nullable().optional(),
  message: z.string().trim().min(1),
})

export type NotificationWrite = z.infer<typeof notificationWriteSchema>
