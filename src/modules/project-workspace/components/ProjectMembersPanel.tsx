"use client"

import * as React from "react"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  PROJECT_ROLE_LABELS,
  PROJECT_ROLES,
  SKILL_TAGS,
  SKILL_TAG_LABELS,
  type ProjectMember,
  type ProjectRole,
  type SkillTag,
} from "@/lib/domain"
import { useUsers } from "@/hooks/useUsers"
import { useProjectMembers } from "@/modules/project-workspace/hooks/useProjectMembers"
import {
  addProjectMember,
  removeProjectMember,
} from "@/modules/project-workspace/services/projects.client"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ProjectMembersPanel({
  projectId,
  canManage,
}: {
  projectId: string
  canManage: boolean
}) {
  const { members, loading, error, refresh } = useProjectMembers(projectId)
  const { users } = useUsers()

  const nameOf = React.useCallback(
    (uid: string) => users.find((u) => u.id === uid)?.name ?? uid,
    [users]
  )
  const memberUserIds = new Set((members ?? []).map((m) => m.user_id))
  const addable = users.filter((u) => !memberUserIds.has(u.id))

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Thành viên dự án</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="flex flex-col divide-y rounded-lg border">
        {loading ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">Đang tải...</li>
        ) : members && members.length > 0 ? (
          members.map((m) => (
            <MemberRow
              key={m.id}
              projectId={projectId}
              member={m}
              name={nameOf(m.user_id)}
              canManage={canManage}
              onChanged={refresh}
            />
          ))
        ) : (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            Chưa có thành viên.
          </li>
        )}
      </ul>

      {canManage && addable.length > 0 && (
        <AddMemberForm
          projectId={projectId}
          addable={addable}
          onAdded={refresh}
        />
      )}
    </section>
  )
}

function MemberRow({
  projectId,
  member,
  name,
  canManage,
  onChanged,
}: {
  projectId: string
  member: ProjectMember
  name: string
  canManage: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  async function remove() {
    setBusy(true)
    try {
      await removeProjectMember(projectId, member.id)
      toast.success(`Đã gỡ ${name}`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không gỡ được")
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="flex flex-col">
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">
          {PROJECT_ROLE_LABELS[member.project_role]}
          {member.skill_tag ? ` · ${SKILL_TAG_LABELS[member.skill_tag]}` : ""}
        </span>
      </div>
      {canManage && (
        <Button
          size="icon"
          variant="ghost"
          disabled={busy}
          onClick={remove}
          aria-label={`Gỡ ${name}`}
        >
          <Trash2Icon className="size-4" />
        </Button>
      )}
    </li>
  )
}

function AddMemberForm({
  projectId,
  addable,
  onAdded,
}: {
  projectId: string
  addable: Array<{ id: string; name: string }>
  onAdded: () => void
}) {
  const [userId, setUserId] = React.useState("")
  const [role, setRole] = React.useState<ProjectRole>("staff")
  const [skill, setSkill] = React.useState<SkillTag | "none">("none")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!userId) return
    setBusy(true)
    try {
      await addProjectMember(projectId, {
        user_id: userId,
        project_role: role,
        skill_tag: skill === "none" ? null : skill,
      })
      toast.success("Đã thêm thành viên")
      setUserId("")
      setSkill("none")
      setRole("staff")
      onAdded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thêm được")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
      <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
        <SelectTrigger size="sm" className="w-48">
          <SelectValue placeholder="Chọn người" />
        </SelectTrigger>
        <SelectContent>
          {addable.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={role}
        onValueChange={(v) => v && setRole(v as ProjectRole)}
      >
        <SelectTrigger size="sm" className="w-36">
          <SelectValue>{PROJECT_ROLE_LABELS[role]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PROJECT_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {PROJECT_ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={skill}
        onValueChange={(v) => v && setSkill(v as SkillTag | "none")}
      >
        <SelectTrigger size="sm" className="w-36">
          <SelectValue>
            {skill === "none" ? "Không nhãn" : SKILL_TAG_LABELS[skill]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Không nhãn</SelectItem>
          {SKILL_TAGS.map((s) => (
            <SelectItem key={s} value={s}>
              {SKILL_TAG_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button size="sm" disabled={busy || !userId} onClick={submit}>
        Thêm
      </Button>
    </div>
  )
}
