import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore"

import {
  CALENDAR_COLLECTIONS,
  dueReminderId,
  expandRecurrence,
  reminderRecipientUids,
  reminderSendAtMs,
  SINGLE_OCCURRENCE_KEY,
  vnDateKey,
  type CalendarItem,
  type RecurrenceException,
  type Reminder,
} from "@/lib/domain/calendar"
import { queueNotifications } from "@/lib/server/calendar/calendarNotifications"

// The reminder queue `dueReminders` and its two jobs (Mục C §5; Mục D
// tasks 10.3 / 10.4 / 10.5 / 10.6). Mục C hands these to Cloud Functions; this
// repo has none (spec doc answer #2), so the non-recurring recompute runs inline
// in the item-write path and the recurring expand + the send run from
// `/api/jobs/**` on the GitHub Actions cron.

const DUE = CALENDAR_COLLECTIONS.dueReminders
const ITEMS = CALENDAR_COLLECTIONS.calendarItems
const EXC = CALENDAR_COLLECTIONS.exceptions

const RECURRING_HORIZON_MS = 36 * 60 * 60 * 1000

const ts = (t: unknown): number => {
  const v = t as { toMillis?: () => number } | null
  return typeof v?.toMillis === "function" ? v.toMillis() : 0
}

// One `dueReminders` doc per offset (Mục C §5 key `${itemId}_${occurrenceKey}_
// ${offset}`), so re-running a recompute overwrites instead of duplicating.
// Dedupe reminders by offset, preferring the push channel.
function byOffset(reminders: readonly Reminder[]): Map<number, Reminder> {
  const m = new Map<number, Reminder>()
  for (const r of reminders) {
    const cur = m.get(r.offsetMinutes)
    if (!cur || (cur.channel !== "push" && r.channel === "push")) {
      m.set(r.offsetMinutes, r)
    }
  }
  return m
}

interface QueueRow {
  itemId: string
  occurrenceKey: string
  recipientUids: string[]
  sendAtMs: number
  channel: Reminder["channel"]
  title: string
  startAtMs: number
}

function queueDoc(row: QueueRow) {
  return {
    itemId: row.itemId,
    occurrenceKey: row.occurrenceKey,
    recipientUids: row.recipientUids,
    sendAt: Timestamp.fromMillis(row.sendAtMs),
    channel: row.channel,
    status: "pending" as const,
    title: row.title,
    startAt: Timestamp.fromMillis(row.startAtMs),
  }
}

// ── task 10.3 — non-recurring: recompute on every item write ─────────────────
//
// Deletes the item's stale `pending` single-occurrence reminders and re-queues
// from the current `reminders` / `startAt` / recipients. A `sendAt` already in
// the past is skipped (Mục C §5 — "không gửi nhắc trễ do vừa sửa"). When the
// item is gone / soft-deleted / became recurring, this only clears.
export async function recomputeItemReminders(
  db: Firestore,
  itemId: string,
  nowMs: number = Date.now()
): Promise<void> {
  const snap = await db.collection(ITEMS).doc(itemId).get()
  const existing = await db
    .collection(DUE)
    .where("itemId", "==", itemId)
    .get()

  const batch = db.batch()
  // clear every stale single-occurrence pending row for this item
  const staleSingle = existing.docs.filter(
    (d) =>
      d.data().occurrenceKey === SINGLE_OCCURRENCE_KEY &&
      d.data().status === "pending"
  )
  for (const d of staleSingle) batch.delete(d.ref)

  const data = snap.data()
  const gone = !snap.exists || data?.deletedAt != null
  const recurring = Boolean(data?.isRecurring)
  const reminders: Reminder[] = Array.isArray(data?.reminders)
    ? (data!.reminders as Reminder[])
    : []

  if (!gone && !recurring && reminders.length > 0) {
    const startMs = ts(data!.startAt)
    const recipients = reminderRecipientUids(
      Array.isArray(data!.assigneeIds) ? (data!.assigneeIds as string[]) : [],
      String(data!.createdBy ?? "")
    )
    for (const [offset, r] of byOffset(reminders)) {
      const sendAtMs = reminderSendAtMs(startMs, offset)
      if (sendAtMs <= nowMs) continue
      batch.set(
        db.collection(DUE).doc(dueReminderId(itemId, SINGLE_OCCURRENCE_KEY, offset)),
        queueDoc({
          itemId,
          occurrenceKey: SINGLE_OCCURRENCE_KEY,
          recipientUids: recipients,
          sendAtMs,
          channel: r.channel,
          title: String(data!.title ?? ""),
          startAtMs: startMs,
        })
      )
    }
  }

  await batch.commit()
}

// ── task 10.4 — recurring: expand the next 36h, upsert idempotently ─────────
export async function expandRecurringReminders(
  db: Firestore,
  nowMs: number = Date.now()
): Promise<{ scanned: number; upserted: number }> {
  const masters = await db
    .collection(ITEMS)
    .where("deletedAt", "==", null)
    .where("isRecurring", "==", true)
    .get()

  const horizonEnd = nowMs + RECURRING_HORIZON_MS
  const windowStartDay = vnDateKey(nowMs)
  const windowEndDay = vnDateKey(horizonEnd)

  let upserted = 0
  let scanned = 0

  for (const doc of masters.docs) {
    const master = { id: doc.id, ...(doc.data() as object) } as CalendarItem
    const reminders: Reminder[] = Array.isArray(master.reminders)
      ? master.reminders
      : []
    if (reminders.length === 0) continue
    scanned++

    const exSnap = await doc.ref.collection(EXC).get()
    const exceptions = exSnap.docs.map(
      (e) => ({ originalDateKey: e.id, ...(e.data() as object) }) as RecurrenceException
    )

    const occurrences = expandRecurrence(
      master,
      exceptions,
      windowStartDay,
      windowEndDay
    )
    const recipients = reminderRecipientUids(
      master.assigneeIds ?? [],
      master.createdBy
    )

    for (const occ of occurrences) {
      const occKey = occ.occurrence!.occurrenceKey
      const occStartMs = ts(occ.startAt)
      for (const [offset, r] of byOffset(reminders)) {
        const sendAtMs = reminderSendAtMs(occStartMs, offset)
        // only queue reminders still ahead of us and inside the horizon
        // (Mục C §5 — "không gửi nhắc trễ")
        if (sendAtMs <= nowMs || sendAtMs > horizonEnd) continue
        const ref = db
          .collection(DUE)
          .doc(dueReminderId(master.id, occKey, offset))
        const cur = await ref.get()
        // idempotent: never resurrect an already-sent / cancelled row
        if (cur.exists && cur.data()?.status !== "pending") continue
        await ref.set(
          queueDoc({
            itemId: master.id,
            occurrenceKey: occKey,
            recipientUids: recipients,
            sendAtMs,
            channel: r.channel,
            title: occ.title ?? "",
            startAtMs: occStartMs,
          })
        )
        upserted++
      }
    }
  }

  return { scanned, upserted }
}

// ── task 10.5 — the send job ────────────────────────────────────────────────
export async function sendDueReminders(
  db: Firestore,
  nowMs: number = Date.now()
): Promise<{ sent: number; notifications: number }> {
  const due = await db
    .collection(DUE)
    .where("status", "==", "pending")
    .where("sendAt", "<=", Timestamp.fromMillis(nowMs))
    .get()

  if (due.empty) return { sent: 0, notifications: 0 }

  let notifications = 0
  const batch = db.batch()
  for (const d of due.docs) {
    const r = d.data()
    notifications += queueNotifications(
      db,
      batch,
      Array.isArray(r.recipientUids) ? (r.recipientUids as string[]) : [],
      {
        kind: "reminder",
        itemId: String(r.itemId ?? ""),
        occurrenceKey:
          r.occurrenceKey === SINGLE_OCCURRENCE_KEY
            ? null
            : String(r.occurrenceKey ?? ""),
        itemTitle: String(r.title ?? ""),
        itemStartAtMs: ts(r.startAt),
      }
    )
    // push (channel === "push") is deferred past v1 (spec doc answer #3) — the
    // in-app row above is always written; the send job just skips the FCM call.
    batch.update(d.ref, { status: "sent", sentAt: FieldValue.serverTimestamp() })
  }
  await batch.commit()
  return { sent: due.docs.length, notifications }
}

// ── task 10.6 — snooze ─────────────────────────────────────────────────────
// "bỏ nhắc" a delivered reminder → re-queue it just for the person who snoozed,
// `sendAt = now + minutes` (Mục B `calendar-reminders`).
export async function snoozeReminder(
  db: Firestore,
  actorUid: string,
  params: {
    itemId: string
    occurrenceKey: string | null
    itemTitle: string
    itemStartAtMs: number
    minutes: number
  },
  nowMs: number = Date.now()
): Promise<{ sendAt: number }> {
  const sendAtMs = nowMs + params.minutes * 60_000
  const occKey = params.occurrenceKey ?? SINGLE_OCCURRENCE_KEY
  await db
    .collection(DUE)
    .doc(`${params.itemId}_${occKey}_snooze_${actorUid}_${nowMs}`)
    .set(
      queueDoc({
        itemId: params.itemId,
        occurrenceKey: occKey,
        recipientUids: [actorUid],
        sendAtMs,
        channel: "inapp",
        title: params.itemTitle,
        startAtMs: params.itemStartAtMs,
      })
    )
  return { sendAt: sendAtMs }
}

// Cancel every pending reminder for an item — recurring or not (used on delete /
// on a series edit that drops occurrences). Single `itemId` filter so no extra
// composite index is needed; the per-item row count is tiny.
export async function cancelItemReminders(
  db: Firestore,
  itemId: string
): Promise<void> {
  const snap = await db.collection(DUE).where("itemId", "==", itemId).get()
  const pending = snap.docs.filter((d) => d.data().status === "pending")
  if (pending.length === 0) return
  const batch = db.batch()
  for (const d of pending) batch.update(d.ref, { status: "cancelled" })
  await batch.commit()
}
