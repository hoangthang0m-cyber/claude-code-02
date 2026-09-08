import type { MemberRole } from "@/lib/domain/calendar/enums"

// The calendarItems edit matrix (Mục B `calendar-access-control` /
// `item-assignees`), as a pure predicate shared by the client (button
// visibility) and the server (assertCanEditItem). firestore.rules encodes the
// same thing independently.
//
// A Trưởng phòng edits any item; a Nhân sự only an item they created or are an
// assignee of. Whether the calendar itself accepts writes (archived /
// managerOnly) is a separate check (assertCalendarAcceptsItems).
export function canEditCalendarItem(
  item: { createdBy: string; assigneeIds: readonly string[] },
  actor: { uid: string; role: MemberRole }
): boolean {
  if (actor.role === "manager") return true
  return (
    item.createdBy === actor.uid ||
    (item.assigneeIds ?? []).includes(actor.uid)
  )
}
