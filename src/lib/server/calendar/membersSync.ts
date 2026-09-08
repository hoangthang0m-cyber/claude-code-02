import { FieldValue, type Firestore } from "firebase-admin/firestore"

import { COLLECTIONS } from "@/lib/domain"
import {
  CALENDAR_COLLECTIONS,
  DEFAULT_PERSONAL_CALENDAR_COLOR,
  type MemberRole,
} from "@/lib/domain/calendar"

// Keeps `members/{uid}` — the read-fast copy of the marketing-team directory the
// calendar's Security Rules and UI read (Mục C §1 / §7) — in step with the
// source `users` collection.
//
// Mục C §7 sketches a Cloud Function `onWrite`, but this repo has no Cloud
// Functions (spec doc answer #2). Instead the sync runs from two places, both
// server-side via firebase-admin so `members` stays `write: if false` for
// clients:
//   - POST /api/members/self         — on login (AuthContext), for the caller
//   - POST /api/jobs/members-reconcile — nightly, for everyone (role/name drift)
// The first run is `scripts/backfill-members.mjs` (same projection).

const USERS = COLLECTIONS.users
const MEMBERS = CALENDAR_COLLECTIONS.members
const CALENDARS = CALENDAR_COLLECTIONS.calendars

export interface MemberFields {
  displayName: string
  photoURL: string | null
  role: MemberRole
  active: boolean
}

export interface SyncResult {
  uid: string
  memberCreated: boolean
  personalCalendarCreated: boolean
}

// Project a `users` doc (name, email, system_role, avatar) onto the `members`
// shape. `fallback` fills gaps from the auth token on a first login where the
// `users` doc might not have committed yet.
export function resolveMemberFields(
  userData: Record<string, unknown> | undefined,
  fallback: { email?: string | null; system_role?: string } = {}
): MemberFields {
  const name = String(userData?.name ?? "").trim()
  const email = String(userData?.email ?? fallback.email ?? "")
  const systemRole = String(userData?.system_role ?? fallback.system_role ?? "staff")
  return {
    displayName: name || email.split("@")[0] || "Thành viên",
    photoURL: (userData?.avatar as string) || null,
    role: systemRole === "manager" ? "manager" : "staff",
    active: true,
  }
}

// Create the owner's personal calendar (`kind: "personal"`) if they do not have
// one yet (Mục B `team-calendar` "Mỗi thành viên có sẵn một lịch cá nhân" /
// task 2.4). Idempotent — returns whether it created one.
export async function ensurePersonalCalendar(
  db: Firestore,
  uid: string,
  displayName: string
): Promise<boolean> {
  const existing = await db
    .collection(CALENDARS)
    .where("kind", "==", "personal")
    .where("ownerUid", "==", uid)
    .limit(1)
    .get()
  if (!existing.empty) return false

  const now = FieldValue.serverTimestamp()
  await db.collection(CALENDARS).add({
    name: displayName,
    color: DEFAULT_PERSONAL_CALENDAR_COLOR,
    description: null,
    kind: "personal",
    ownerUid: uid,
    writeScope: "everyone",
    defaultReminders: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
  return true
}

async function writeMember(
  db: Firestore,
  uid: string,
  fields: MemberFields
): Promise<SyncResult> {
  const ref = db.collection(MEMBERS).doc(uid)
  const before = await ref.get()

  await ref.set(
    { uid, ...fields, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )

  const personalCalendarCreated = fields.active
    ? await ensurePersonalCalendar(db, uid, fields.displayName)
    : false

  return { uid, memberCreated: !before.exists, personalCalendarCreated }
}

// One person — called by POST /api/members/self right after login.
export async function syncSelfMember(
  db: Firestore,
  authed: { uid: string; email: string | null; system_role: string }
): Promise<SyncResult> {
  const userSnap = await db.collection(USERS).doc(authed.uid).get()
  const fields = resolveMemberFields(userSnap.data(), {
    email: authed.email,
    system_role: authed.system_role,
  })
  return writeMember(db, authed.uid, fields)
}

export interface ReconcileResult {
  usersScanned: number
  membersCreated: number
  membersUpdated: number
  personalCalendarsCreated: number
  deactivated: number
}

// Everyone — nightly job (Mục D task 2.1 nightly half) and the backfill
// (task 2.2). Upserts a member for every `users` doc, then deactivates any
// member whose `users` doc has gone.
export async function reconcileAllMembers(
  db: Firestore
): Promise<ReconcileResult> {
  const usersSnap = await db.collection(USERS).get()
  const seen = new Set<string>()

  let membersCreated = 0
  let membersUpdated = 0
  let personalCalendarsCreated = 0

  for (const userDoc of usersSnap.docs) {
    seen.add(userDoc.id)
    const fields = resolveMemberFields(userDoc.data())
    const r = await writeMember(db, userDoc.id, fields)
    if (r.memberCreated) membersCreated++
    else membersUpdated++
    if (r.personalCalendarCreated) personalCalendarsCreated++
  }

  const membersSnap = await db.collection(MEMBERS).get()
  let deactivated = 0
  for (const memberDoc of membersSnap.docs) {
    if (seen.has(memberDoc.id)) continue
    if (memberDoc.data().active === false) continue
    await memberDoc.ref.set(
      { active: false, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
    deactivated++
  }

  return {
    usersScanned: usersSnap.size,
    membersCreated,
    membersUpdated,
    personalCalendarsCreated,
    deactivated,
  }
}
