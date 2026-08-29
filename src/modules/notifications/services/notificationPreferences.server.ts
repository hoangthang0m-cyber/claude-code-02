import {
  COLLECTIONS,
  NOTIFICATION_GROUPS,
  NOTIFICATION_GROUP_LABELS,
  notificationPreferenceDocId,
  notificationPreferenceUpdateSchema,
  type NotificationGroup,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { parseOrThrow } from "@/lib/server/validate"

// SPEC §5.7 R4, task 7.5: each person turns notification groups on/off for
// themselves. Opt-out model — one `notificationPreferences/${uid}__${group}`
// row, and its absence means "enabled". The engine (task 7.2) reads the same
// rows to drop muted recipients.

export interface NotificationPreferenceView {
  group: NotificationGroup
  label: string
  enabled: boolean
}

export async function listNotificationPreferences(
  actor: AuthedUser
): Promise<{ preferences: NotificationPreferenceView[] }> {
  const db = getAdminDb()
  const snaps = await Promise.all(
    NOTIFICATION_GROUPS.map((g) =>
      db
        .collection(COLLECTIONS.notificationPreferences)
        .doc(notificationPreferenceDocId(actor.uid, g))
        .get()
    )
  )
  return {
    preferences: NOTIFICATION_GROUPS.map((group, i) => {
      const snap = snaps[i]
      const enabled = !(snap.exists && snap.data()?.enabled === false)
      return { group, label: NOTIFICATION_GROUP_LABELS[group], enabled }
    }),
  }
}

export async function setNotificationPreference(
  actor: AuthedUser,
  body: unknown
): Promise<{ group: NotificationGroup; enabled: boolean }> {
  const { group, enabled } = parseOrThrow(
    notificationPreferenceUpdateSchema,
    body
  )
  await getAdminDb()
    .collection(COLLECTIONS.notificationPreferences)
    .doc(notificationPreferenceDocId(actor.uid, group))
    .set({ user_id: actor.uid, group, enabled }, { merge: true })
  return { group, enabled }
}
