import { doc, setDoc } from "firebase/firestore"

import { db } from "@/firebase/config"
import {
  CALENDAR_COLLECTIONS,
  type CalendarColorKey,
  type CalendarView,
} from "@/lib/domain/calendar"

// userCalendarPrefs/{uid} is per-viewer state (firestore.rules: isOwner) — the
// client writes it directly, no route handler (Mục D task 4.2 / 6.11).
// `setDoc(merge)` replaces the array/map wholesale, so callers pass the full
// next value.

function prefsRef(uid: string) {
  return doc(db, CALENDAR_COLLECTIONS.userCalendarPrefs, uid)
}

export async function setCalendarHidden(
  uid: string,
  currentHidden: readonly string[],
  calendarId: string,
  hidden: boolean
): Promise<void> {
  const next = hidden
    ? [...new Set([...currentHidden, calendarId])]
    : currentHidden.filter((id) => id !== calendarId)
  await setDoc(prefsRef(uid), { uid, hidden: next }, { merge: true })
}

export async function setCalendarColorOverride(
  uid: string,
  currentOverrides: Readonly<Record<string, CalendarColorKey>>,
  calendarId: string,
  color: CalendarColorKey | null
): Promise<void> {
  const next: Record<string, CalendarColorKey> = { ...currentOverrides }
  if (color) next[calendarId] = color
  else delete next[calendarId]
  await setDoc(prefsRef(uid), { uid, colorOverrides: next }, { merge: true })
}

export async function setLastView(
  uid: string,
  lastView: CalendarView
): Promise<void> {
  await setDoc(prefsRef(uid), { uid, lastView }, { merge: true })
}

export async function setShowWeekNumbers(
  uid: string,
  showWeekNumbers: boolean
): Promise<void> {
  await setDoc(prefsRef(uid), { uid, showWeekNumbers }, { merge: true })
}
