"use client"

import * as React from "react"
import { collection, doc, onSnapshot, query, where } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import {
  CALENDAR_COLLECTIONS,
  CALENDAR_SETTINGS_DOC_ID,
  DEFAULT_CALENDAR_SETTINGS,
  type CalendarSettings,
  type Member,
} from "@/lib/domain/calendar"

// Two realtime reads shared by the whole calendar screen (Mục D task 3.1):
//   - config/calendarSettings  → timezone / weekStartsOn / defaultView
//   - members (active)          → the assignee directory
// One onSnapshot each; both guarded on an authenticated user.

// ── settings ────────────────────────────────────────────────────────────────

interface CalendarSettingsValue {
  settings: CalendarSettings
  loading: boolean
}

const SettingsContext = React.createContext<CalendarSettingsValue>({
  settings: DEFAULT_CALENDAR_SETTINGS,
  loading: true,
})

function CalendarSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [settings, setSettings] = React.useState<CalendarSettings | null>(null)

  React.useEffect(() => {
    if (!user) return
    return onSnapshot(
      doc(db, CALENDAR_COLLECTIONS.config, CALENDAR_SETTINGS_DOC_ID),
      (snap) =>
        setSettings(
          snap.exists()
            ? { ...DEFAULT_CALENDAR_SETTINGS, ...(snap.data() as Partial<CalendarSettings>) }
            : DEFAULT_CALENDAR_SETTINGS
        ),
      () => setSettings(DEFAULT_CALENDAR_SETTINGS)
    )
  }, [user])

  return (
    <SettingsContext.Provider
      value={{
        settings: settings ?? DEFAULT_CALENDAR_SETTINGS,
        loading: settings === null,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useCalendarSettings(): CalendarSettingsValue {
  return React.useContext(SettingsContext)
}

// ── members ─────────────────────────────────────────────────────────────────

interface MembersValue {
  members: Member[]
  byUid: ReadonlyMap<string, Member>
  loading: boolean
}

const MembersContext = React.createContext<MembersValue>({
  members: [],
  byUid: new Map(),
  loading: true,
})

function MembersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [members, setMembers] = React.useState<Member[] | null>(null)

  React.useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(
        collection(db, CALENDAR_COLLECTIONS.members),
        where("active", "==", true)
      ),
      (snap) =>
        setMembers(
          snap.docs
            .map((d) => ({ ...(d.data() as Member), uid: d.id }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"))
        ),
      () => setMembers([])
    )
  }, [user])

  const byUid = React.useMemo(
    () => new Map((members ?? []).map((m) => [m.uid, m])),
    [members]
  )

  return (
    <MembersContext.Provider
      value={{ members: members ?? [], byUid, loading: members === null }}
    >
      {children}
    </MembersContext.Provider>
  )
}

export function useMembers(): MembersValue {
  return React.useContext(MembersContext)
}

// ── root ────────────────────────────────────────────────────────────────────

export function CalendarDataProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CalendarSettingsProvider>
      <MembersProvider>{children}</MembersProvider>
    </CalendarSettingsProvider>
  )
}
