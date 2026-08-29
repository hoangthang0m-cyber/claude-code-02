import { COLLECTIONS, type NotificationType } from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"

// SPEC §5.7 R2 / §6.6, task 7.3: the read side of the notification bell. The
// client polls this every 30s (a channel separate from realtime, so the history
// never depends on the realtime connection). `unread_count` covers ALL unread
// notifications — the badge shows the true number even when the list is capped.

export interface NotificationView {
  id: string
  type: NotificationType
  message: string
  content_item_id: string | null
  project_id: string | null
  read_at: number | null
  created_at: number | null
}

export interface NotificationList {
  unread_count: number
  items: NotificationView[]
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

function toMillis(t: unknown): number | null {
  const v = t as { toMillis?: () => number } | null
  return typeof v?.toMillis === "function" ? v.toMillis() : null
}

// Sorted + capped in memory (no composite index), the same approach as the
// content list, comments and the sync log.
export async function listNotifications(
  actor: AuthedUser,
  opts: { limit?: number } = {}
): Promise<NotificationList> {
  const raw = Math.floor(opts.limit ?? DEFAULT_LIMIT)
  const limit =
    !Number.isFinite(raw) || raw <= 0 ? DEFAULT_LIMIT : Math.min(raw, MAX_LIMIT)

  const snap = await getAdminDb()
    .collection(COLLECTIONS.notifications)
    .where("recipient_id", "==", actor.uid)
    .get()

  const all: NotificationView[] = snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        type: (x.type as NotificationType) ?? "sync_issue",
        message: String(x.message ?? ""),
        content_item_id: (x.content_item_id as string) ?? null,
        project_id: (x.project_id as string) ?? null,
        read_at: toMillis(x.read_at),
        created_at: toMillis(x.created_at),
      }
    })
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))

  return {
    unread_count: all.filter((n) => n.read_at == null).length,
    items: all.slice(0, limit),
  }
}
