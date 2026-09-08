"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { memberInitials } from "@/lib/domain/calendar"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/utils/cn"

// A searchable member checklist (Mục D task 9.1 — the repo has no `cmdk`/`Command`
// component, so "Command + multi-select" is built as a Popover with a filter box
// over the active `members` directory; a name outside the directory simply has no
// row, so it cannot be added). Reused by the item editor's assignee picker and
// the toolbar's assignee filter.
export function MemberMultiSelect({
  value,
  onChange,
  placeholder = "Chọn thành viên",
  triggerClassName,
  renderRowExtra,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  triggerClassName?: string
  renderRowExtra?: (uid: string) => React.ReactNode
}) {
  const { members } = useMembers()
  const [query, setQuery] = React.useState("")

  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? members.filter((m) => m.displayName.toLowerCase().includes(needle))
    : members

  const label =
    value.length === 0
      ? placeholder
      : value
          .map((id) => members.find((m) => m.uid === id)?.displayName ?? id)
          .join(", ")

  function toggle(uid: string) {
    onChange(
      value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid]
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "w-full justify-between font-normal",
              value.length === 0 && "text-muted-foreground",
              triggerClassName
            )}
          >
            <span className="truncate">{label}</span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-0">
        <div className="p-1">
          <Input
            autoFocus
            placeholder="Tìm thành viên…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8"
          />
        </div>
        <ul className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              Không có thành viên khớp
            </li>
          )}
          {filtered.map((m) => {
            const selected = value.includes(m.uid)
            return (
              <li key={m.uid}>
                <button
                  type="button"
                  onClick={() => toggle(m.uid)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <CheckIcon
                    className={cn(
                      "size-4 shrink-0",
                      selected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Avatar className="size-5">
                    {m.photoURL && <AvatarImage src={m.photoURL} />}
                    <AvatarFallback className="text-[10px]">
                      {memberInitials(m.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-left">
                    {m.displayName}
                  </span>
                  {renderRowExtra?.(m.uid)}
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
