import {
  collection,
  onSnapshot,
  query,
  where,
  type Firestore,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore"

import {
  CALENDAR_COLLECTIONS,
  partitionViewItems,
  planViewQueries,
  type CalendarItem,
  type PartitionedViewItems,
  type ViewWindow,
} from "@/lib/domain/calendar"

// Opens the 3+ onSnapshot streams for a calendar view window (Design §2),
// merges them (deduped by id), and calls `onData` with the partitioned set on
// every change. `stop()` detaches every stream — the hook calls it when the
// window or visible-calendar set changes (Mục D task 3.3: "huỷ listener cũ").

export type SnapshotSubscribe = (
  q: Query,
  onNext: (snap: QuerySnapshot) => void,
  onError: (e: FirestoreError) => void
) => Unsubscribe

export interface CalendarItemsListenerOptions {
  db: Firestore
  window: ViewWindow
  visibleCalendarIds: string[]
  onData: (data: PartitionedViewItems) => void
  onError?: (e: FirestoreError) => void
  // injectable for tests
  subscribe?: SnapshotSubscribe
}

export function openCalendarItemsListener(
  opts: CalendarItemsListenerOptions
): { stop: () => void } {
  const subscribe: SnapshotSubscribe =
    opts.subscribe ?? (onSnapshot as unknown as SnapshotSubscribe)
  const visible = new Set(opts.visibleCalendarIds)
  const plan = planViewQueries(opts.window)
  const items = collection(opts.db, CALENDAR_COLLECTIONS.calendarItems)

  const streams = new Map<string, Map<string, CalendarItem>>()
  const unsubs: Unsubscribe[] = []
  let stopped = false

  function emit() {
    if (stopped) return
    const merged = new Map<string, CalendarItem>()
    for (const stream of streams.values()) {
      for (const [id, item] of stream) merged.set(id, item)
    }
    opts.onData(
      partitionViewItems(merged, {
        window: opts.window,
        visibleCalendarIds: visible,
      })
    )
  }

  function attach(key: string, q: Query) {
    streams.set(key, new Map())
    unsubs.push(
      subscribe(
        q,
        (snap) => {
          const next = new Map<string, CalendarItem>()
          snap.forEach((d) =>
            next.set(d.id, {
              id: d.id,
              ...(d.data() as Omit<CalendarItem, "id">),
            })
          )
          streams.set(key, next)
          emit()
        },
        (e) => opts.onError?.(e)
      )
    )
  }

  plan.dayKeyBatches.forEach((batch, i) => {
    attach(
      `short:${i}`,
      query(
        items,
        where("deletedAt", "==", null),
        where("dayKeys", "array-contains-any", batch)
      )
    )
  })

  attach(
    "long-span",
    query(
      items,
      where("deletedAt", "==", null),
      where("isLongSpan", "==", true),
      where("endDay", ">=", opts.window.startDay)
    )
  )

  attach(
    "recurring",
    query(
      items,
      where("deletedAt", "==", null),
      where("isRecurring", "==", true),
      where("startDay", "<=", opts.window.endDay)
    )
  )

  return {
    stop: () => {
      stopped = true
      for (const unsub of unsubs) unsub()
    },
  }
}
