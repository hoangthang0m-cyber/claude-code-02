"use client"

import { memberInitials, type Member } from "@/lib/domain/calendar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/utils/cn"

// Assignee display on an item / in the detail popover (Mục D task 9.3 fills in
// the picker; this is the read-only chip row). Primary assignee first.
export function AssigneeChips({
  assigneeIds,
  primaryAssigneeId,
  byUid,
  expanded = false,
  className,
}: {
  assigneeIds: readonly string[]
  primaryAssigneeId: string | null
  byUid: ReadonlyMap<string, Member>
  expanded?: boolean
  className?: string
}) {
  if (assigneeIds.length === 0) return null

  const ordered = [...assigneeIds].sort((a, b) =>
    a === primaryAssigneeId ? -1 : b === primaryAssigneeId ? 1 : 0
  )

  if (!expanded) {
    const primary = byUid.get(ordered[0])
    const extra = ordered.length - 1
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <Avatar className="size-5">
          {primary?.photoURL && <AvatarImage src={primary.photoURL} />}
          <AvatarFallback className="text-[10px]">
            {memberInitials(primary?.displayName ?? "?")}
          </AvatarFallback>
        </Avatar>
        {extra > 0 && (
          <span className="text-xs text-muted-foreground">+{extra}</span>
        )}
      </span>
    )
  }

  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {ordered.map((uid) => {
        const m = byUid.get(uid)
        return (
          <li key={uid} className="flex items-center gap-2 text-sm">
            <Avatar className="size-5">
              {m?.photoURL && <AvatarImage src={m.photoURL} />}
              <AvatarFallback className="text-[10px]">
                {memberInitials(m?.displayName ?? "?")}
              </AvatarFallback>
            </Avatar>
            <span>{m?.displayName ?? uid}</span>
            {uid === primaryAssigneeId && (
              <span className="text-xs text-muted-foreground">
                (phụ trách chính)
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
