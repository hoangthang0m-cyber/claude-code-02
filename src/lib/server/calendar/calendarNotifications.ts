import {
  FieldValue,
  Timestamp,
  type Firestore,
  type WriteBatch,
} from "firebase-admin/firestore"

import {
  CALENDAR_COLLECTIONS,
  calendarNotificationMessage,
  type CalendarNotificationKind,
} from "@/lib/domain/calendar"
import { HttpError } from "@/lib/server/http"

// The in-app bell feed — `calendarNotifications/{uid}/items/{notifId}`
// (Mục B `item-assignees` "Thông báo khi được giao/gỡ" + `calendar-reminders`
// "chuông in-app"). Server-only writes; the owner reads their own feed via
// onSnapshot and marks rows read through the API here.

const ROOT = CALENDAR_COLLECTIONS.calendarNotifications
const ITEMS = CALENDAR_COLLECTIONS.calendarNotificationItems

function feed(db: Firestore, uid: string) {
  return db.collection(ROOT).doc(uid).collection(ITEMS)
}

export interface NotificationSeed {
  kind: CalendarNotificationKind
  itemId: string
  occurrenceKey: string | null
  itemTitle: string
  itemStartAtMs: number
  /** override the default copy (used for the reminder job) */
  message?: string
}

// Queues one bell row per recipient into `batch`. Never notifies a uid in
// `skip` (Mục B — "Người tự thêm chính mình SHALL KHÔNG nhận thông báo").
export function queueNotifications(
  db: Firestore,
  batch: WriteBatch,
  recipientUids: readonly string[],
  seed: NotificationSeed,
  skip: readonly string[] = []
): number {
  const targets = [...new Set(recipientUids)].filter(
    (uid) => uid && !skip.includes(uid)
  )
  for (const uid of targets) {
    // materialise the parent doc so `calendarNotifications` lists its owners
    // (a Firestore subcollection alone leaves the parent as a missing document)
    batch.set(
      db.collection(ROOT).doc(uid),
      { uid, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
    batch.set(feed(db, uid).doc(), {
      recipientUid: uid,
      kind: seed.kind,
      itemId: seed.itemId,
      occurrenceKey: seed.occurrenceKey,
      itemTitle: seed.itemTitle,
      itemStartAt: Timestamp.fromMillis(seed.itemStartAtMs),
      message:
        seed.message ??
        calendarNotificationMessage(seed.kind, seed.itemTitle || "(Không có tiêu đề)"),
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    })
  }
  return targets.length
}

// Mục B `item-assignees` "Thông báo khi được giao hoặc gỡ khỏi mục": diff the
// assignee list around an edit and tell the people added / removed, never the
// actor.
export async function notifyAssigneeChange(
  db: Firestore,
  params: {
    itemId: string
    itemTitle: string
    itemStartAtMs: number
    before: readonly string[]
    after: readonly string[]
    actorUid: string
  }
): Promise<void> {
  const before = new Set(params.before)
  const after = new Set(params.after)
  const added = [...after].filter((uid) => !before.has(uid))
  const removed = [...before].filter((uid) => !after.has(uid))
  if (added.length === 0 && removed.length === 0) return

  const batch = db.batch()
  const base = {
    itemId: params.itemId,
    occurrenceKey: null,
    itemTitle: params.itemTitle,
    itemStartAtMs: params.itemStartAtMs,
  }
  queueNotifications(db, batch, added, { ...base, kind: "assigned" }, [
    params.actorUid,
  ])
  queueNotifications(db, batch, removed, { ...base, kind: "unassigned" }, [
    params.actorUid,
  ])
  await batch.commit()
}

// ── Read side (the bell) ────────────────────────────────────────────────────

const toMs = (t: unknown): number | null => {
  const v = t as { toMillis?: () => number } | null
  return typeof v?.toMillis === "function" ? v.toMillis() : null
}

export interface StoredNotification {
  kind: CalendarNotificationKind
  itemId: string
  occurrenceKey: string | null
  itemTitle: string
  itemStartAtMs: number
}

// Loads one row of the owner's feed (404 if absent). Used by the snooze flow.
export async function loadNotification(
  db: Firestore,
  uid: string,
  notifId: string
): Promise<StoredNotification> {
  const snap = await feed(db, uid).doc(notifId).get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy thông báo")
  const d = snap.data()!
  return {
    kind: d.kind as CalendarNotificationKind,
    itemId: String(d.itemId ?? ""),
    occurrenceKey: (d.occurrenceKey as string | null) ?? null,
    itemTitle: String(d.itemTitle ?? ""),
    itemStartAtMs: toMs(d.itemStartAt) ?? Date.now(),
  }
}

export async function markNotificationRead(
  db: Firestore,
  uid: string,
  notifId: string
): Promise<{ id: string; readAt: number }> {
  const ref = feed(db, uid).doc(notifId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy thông báo")
  const existing = toMs(snap.data()?.readAt)
  if (existing != null) return { id: notifId, readAt: existing }
  const now = Date.now()
  await ref.update({ readAt: FieldValue.serverTimestamp() })
  return { id: notifId, readAt: now }
}

export async function markAllNotificationsRead(
  db: Firestore,
  uid: string
): Promise<{ marked: number }> {
  const snap = await feed(db, uid).where("readAt", "==", null).get()
  if (snap.empty) return { marked: 0 }
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch()
    for (const d of snap.docs.slice(i, i + 450)) {
      batch.update(d.ref, { readAt: FieldValue.serverTimestamp() })
    }
    await batch.commit()
  }
  return { marked: snap.docs.length }
}
