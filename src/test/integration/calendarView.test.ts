import { readFileSync } from "node:fs"

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { doc, setDoc, Timestamp, type Firestore } from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  computeDayFields,
  vnDayStartMs,
  type PartitionedViewItems,
  type ViewWindow,
} from "@/lib/domain/calendar"
import { openCalendarItemsListener } from "@/modules/team-calendar/services/calendarItemsListener"

// The view query strategy against the emulator (Mục D task 3.3): a multi-month
// item shows in every window it overlaps, and changing the window tears down the
// old listeners.

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
const [HOST, PORT] = EMULATOR.split(":")

let env: RulesTestEnvironment

const AUG: ViewWindow = { startDay: "2026-08-01", endDay: "2026-08-31" }
const SEP: ViewWindow = { startDay: "2026-09-01", endDay: "2026-09-30" }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-team-calendar",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: HOST,
      port: Number(PORT),
    },
  })
})

afterAll(() => env.cleanup())

async function seedItem(
  id: string,
  fields: {
    calendarId: string
    startAtMs: number
    endAtMs: number
    allDay?: boolean
    recurrence?: string | null
    deletedAt?: Timestamp | null
  }
) {
  const day = computeDayFields({
    startAt: fields.startAtMs,
    endAt: fields.endAtMs,
    allDay: fields.allDay,
  })
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "calendarItems", id), {
      calendarId: fields.calendarId,
      type: "task",
      title: id,
      description: null,
      location: null,
      allDay: fields.allDay ?? false,
      startAt: Timestamp.fromMillis(fields.startAtMs),
      endAt: Timestamp.fromMillis(fields.endAtMs),
      startDay: day.startDay,
      endDay: day.endDay,
      spanDays: day.spanDays,
      dayKeys: day.dayKeys,
      isLongSpan: day.isLongSpan,
      isRecurring: (fields.recurrence ?? null) !== null,
      colorOverride: null,
      assigneeIds: [],
      primaryAssigneeId: null,
      linkedProjectId: null,
      linkedContentItemId: null,
      reminders: [],
      recurrence: fields.recurrence ?? null,
      recurrenceId: null,
      createdBy: "u1",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      deletedAt: fields.deletedAt ?? null,
    })
  })
}

const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms))

async function waitFor(predicate: () => boolean, timeoutMs = 8000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: timed out")
    await new Promise((r) => setTimeout(r, 50))
  }
}

const ids = (d?: PartitionedViewItems) => (d?.items ?? []).map((i) => i.id)
const masterIds = (d?: PartitionedViewItems) =>
  (d?.recurringMasters ?? []).map((i) => i.id)

function listen(window: ViewWindow, visibleCalendarIds: string[]) {
  const emissions: PartitionedViewItems[] = []
  // rules-unit-testing bundles its own @firebase/firestore — same runtime, nominally
  // different type from the app's firebase/firestore.
  const db = env.authenticatedContext("u1").firestore() as unknown as Firestore
  const listener = openCalendarItemsListener({
    db,
    window,
    visibleCalendarIds,
    onData: (d) => emissions.push(d),
  })
  return { emissions, stop: listener.stop, last: () => emissions[emissions.length - 1] }
}

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "members", "u1"), {
      uid: "u1",
      displayName: "An",
      photoURL: null,
      role: "staff",
      active: true,
    })
  })
})

describe("multi-month items (task 3.3)", () => {
  it("an item spanning Aug 25 – Sep 5 shows in BOTH the Aug and Sep windows", async () => {
    await seedItem("cross", {
      calendarId: "calA",
      allDay: true,
      startAtMs: vnDayStartMs("2026-08-25"),
      endAtMs: vnDayStartMs("2026-09-06"),
    })

    const aug = listen(AUG, ["calA"])
    const sep = listen(SEP, ["calA"])
    await waitFor(() => ids(aug.last()).includes("cross") && ids(sep.last()).includes("cross"))

    aug.stop()
    sep.stop()
  })

  it("a 90-day long-span item shows via the long-span stream", async () => {
    await seedItem("goal", {
      calendarId: "calA",
      allDay: true,
      startAtMs: vnDayStartMs("2026-06-01"),
      endAtMs: vnDayStartMs("2026-11-01"),
    })
    const sep = listen(SEP, ["calA"])
    await waitFor(() => ids(sep.last()).includes("goal"))
    sep.stop()
  })
})

describe("partitioning", () => {
  it("recurring masters go to recurringMasters, not items", async () => {
    await seedItem("weekly", {
      calendarId: "calA",
      startAtMs: vnDayStartMs("2026-09-07") + 2 * 3600_000,
      endAtMs: vnDayStartMs("2026-09-07") + 3 * 3600_000,
      recurrence: "FREQ=WEEKLY;BYDAY=MO",
    })
    const sep = listen(SEP, ["calA"])
    await waitFor(() => masterIds(sep.last()).includes("weekly"))
    expect(ids(sep.last())).toHaveLength(0)
    sep.stop()
  })

  it("items in a hidden (not-visible) calendar are filtered out", async () => {
    await seedItem("a", {
      calendarId: "calA",
      startAtMs: vnDayStartMs("2026-09-10") + 3600_000,
      endAtMs: vnDayStartMs("2026-09-10") + 7200_000,
    })
    await seedItem("b", {
      calendarId: "calHidden",
      startAtMs: vnDayStartMs("2026-09-10") + 3600_000,
      endAtMs: vnDayStartMs("2026-09-10") + 7200_000,
    })
    const sep = listen(SEP, ["calA"])
    await waitFor(() => ids(sep.last()).includes("a"))
    await settle(300) // give a possible "b" emission a chance, then assert it never came
    expect(ids(sep.last())).toEqual(["a"])
    sep.stop()
  })
})

describe("listener lifecycle (task 3.3 — huỷ listener cũ)", () => {
  it("stop() detaches: a later write produces no further emission", async () => {
    await seedItem("first", {
      calendarId: "calA",
      startAtMs: vnDayStartMs("2026-09-10") + 3600_000,
      endAtMs: vnDayStartMs("2026-09-10") + 7200_000,
    })
    const sep = listen(SEP, ["calA"])
    await waitFor(() => ids(sep.last()).includes("first"))
    const countAtStop = sep.emissions.length
    sep.stop()

    await seedItem("late", {
      calendarId: "calA",
      startAtMs: vnDayStartMs("2026-09-12") + 3600_000,
      endAtMs: vnDayStartMs("2026-09-12") + 7200_000,
    })
    await settle(700)
    expect(sep.emissions.length).toBe(countAtStop)
  })

  it("a fresh listener on a new window sees only that window", async () => {
    await seedItem("aug-only", {
      calendarId: "calA",
      allDay: true,
      startAtMs: vnDayStartMs("2026-08-10"),
      endAtMs: vnDayStartMs("2026-08-12"),
    })
    const aug = listen(AUG, ["calA"])
    await waitFor(() => ids(aug.last()).includes("aug-only"))
    aug.stop()

    const sep = listen(SEP, ["calA"])
    await settle(700)
    expect(ids(sep.last())).toHaveLength(0)
    sep.stop()
  })
})
