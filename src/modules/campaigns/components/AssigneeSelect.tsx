"use client"

import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useUsers } from "@/hooks/useUsers"
import { getAssigneeColor } from "@/constants/assigneeColors"

export function AssigneeSelect({
  value,
  onChange,
  disabled,
}: {
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const { users } = useUsers()
  const current = users.find((u) => u.id === value)

  return (
    <Select value={value ?? ""} onValueChange={(next) => onChange(next ?? "")} disabled={disabled}>
      <SelectTrigger size="sm" className="w-full">
        <SelectValue placeholder="Chưa gán">
          {current ? (
            <Badge className={getAssigneeColor(current.id)}>{current.name}</Badge>
          ) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {users.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            <Badge className={getAssigneeColor(user.id)}>{user.name}</Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
