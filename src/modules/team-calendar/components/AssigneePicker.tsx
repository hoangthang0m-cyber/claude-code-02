"use client"

import { StarIcon, XIcon } from "lucide-react"

import {
  memberInitials,
  orderAssigneesByPrimary,
  resolvePrimaryAssignee,
} from "@/lib/domain/calendar"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"
import { MemberMultiSelect } from "@/modules/team-calendar/components/MemberMultiSelect"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/utils/cn"

// "Người đảm nhận" editor for the item form (Mục D tasks 9.1 / 9.2). Multi-select
// from the active directory, plus a star to pick the one "phụ trách chính". The
// primary invariant (`resolvePrimaryAssignee`) is enforced here so the payload
// the form sends already satisfies it; the server re-checks anyway.
export function AssigneePicker({
  value,
  primaryId,
  onChange,
}: {
  value: string[]
  primaryId: string | null
  onChange: (assigneeIds: string[], primaryAssigneeId: string | null) => void
}) {
  const { byUid } = useMembers()

  function setAssignees(next: string[]) {
    onChange(next, resolvePrimaryAssignee(next, primaryId))
  }

  function setPrimary(uid: string) {
    onChange(value, resolvePrimaryAssignee(value, uid))
  }

  const ordered = orderAssigneesByPrimary(value, primaryId)

  return (
    <div className="flex flex-col gap-2">
      <MemberMultiSelect
        value={value}
        onChange={setAssignees}
        placeholder="Thêm người đảm nhận"
        renderRowExtra={(uid) =>
          value.includes(uid) && uid === primaryId ? (
            <StarIcon className="size-3.5 shrink-0 fill-current text-amber-500" />
          ) : null
        }
      />

      {ordered.length > 0 && (
        <ul className="flex flex-col gap-1">
          {ordered.map((uid) => {
            const m = byUid.get(uid)
            const isPrimary = uid === primaryId
            return (
              <li
                key={uid}
                className="flex items-center gap-2 rounded border px-2 py-1 text-sm"
              >
                <Avatar className="size-5">
                  {m?.photoURL && <AvatarImage src={m.photoURL} />}
                  <AvatarFallback className="text-[10px]">
                    {memberInitials(m?.displayName ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">
                  {m?.displayName ?? uid}
                </span>
                <button
                  type="button"
                  onClick={() => setPrimary(uid)}
                  aria-pressed={isPrimary}
                  title={
                    isPrimary ? "Người phụ trách chính" : "Đặt làm phụ trách chính"
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1 text-xs",
                    isPrimary
                      ? "text-amber-600"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <StarIcon
                    className={cn("size-3.5", isPrimary && "fill-current")}
                  />
                  {isPrimary ? "chính" : "đặt chính"}
                </button>
                <button
                  type="button"
                  onClick={() => setAssignees(value.filter((x) => x !== uid))}
                  title="Gỡ khỏi mục"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
