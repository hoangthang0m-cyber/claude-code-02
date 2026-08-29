import { z } from "zod"

import { NOTIFICATION_GROUPS, type NotificationGroup } from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: NotificationPreference (id, user_id, group, enabled)
//
// One row per (user, group). Absence of a row = enabled (opt-out model,
// SPEC §5.7 R4).

export interface NotificationPreference {
  id: string
  user_id: string
  group: NotificationGroup
  enabled: boolean
}

export const notificationPreferenceWriteSchema = z.object({
  user_id: idString,
  group: z.enum(NOTIFICATION_GROUPS),
  enabled: z.boolean(),
})

export type NotificationPreferenceWrite = z.infer<
  typeof notificationPreferenceWriteSchema
>

// API body for toggling one group (SPEC §5.7 R4, task 7.5). `user_id` comes
// from the auth context, not the body.
export const notificationPreferenceUpdateSchema = z.object({
  group: z.enum(NOTIFICATION_GROUPS),
  enabled: z.boolean(),
})

export type NotificationPreferenceUpdate = z.infer<
  typeof notificationPreferenceUpdateSchema
>

// Deterministic id, one row per (user, group) — `${userId}__${group}`. Lets the
// engine check a preference with a single get() and firestore.rules scope it to
// the owner.
export function notificationPreferenceDocId(
  userId: string,
  group: NotificationGroup
): string {
  return `${userId}__${group}`
}
