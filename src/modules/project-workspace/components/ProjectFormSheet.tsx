"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { Project, ProjectCreate, ProjectFormUpdate } from "@/lib/domain"
import { useProjectGroups } from "@/modules/project-grouping/hooks/useProjectGroups"
import {
  createProject,
  updateProject,
} from "@/modules/project-workspace/services/projects.client"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

// project-grouping task 3.3 — the "no group" option in the create form's group
// picker; stripped before the payload is sent.
const NO_GROUP = "__none__"

type Values = {
  name: string
  objective: string
  description: string
  scale: string
  progress_sheet_url: string
  retrospective: string
}

function toValues(project?: Project): Values {
  return {
    name: project?.name ?? "",
    objective: project?.objective ?? "",
    description: project?.description ?? "",
    scale: project?.scale ?? "",
    progress_sheet_url: project?.progress_sheet_url ?? "",
    retrospective: project?.retrospective ?? "",
  }
}

// Non-empty, trimmed fields only.
function toPayload(v: Values) {
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v)) {
    const t = val.trim()
    if (t) out[k] = t
  }
  return out
}

export function ProjectFormSheet({
  mode,
  project,
  trigger,
}: {
  mode: "create" | "edit"
  project?: Project
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState<Values>(toValues(project))
  const [groupId, setGroupId] = React.useState<string>(NO_GROUP)
  const [submitting, setSubmitting] = React.useState(false)
  const { groups } = useProjectGroups()

  // Reset to the current project values each time the sheet opens.
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setValues(toValues(project))
      setGroupId(project?.group_id ?? NO_GROUP)
    }
  }

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((prev) => ({ ...prev, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!values.name.trim() || !values.objective.trim()) {
      toast.error("Cần nhập tên dự án và mục tiêu")
      return
    }
    setSubmitting(true)
    try {
      const payload = toPayload(values)
      if (mode === "create") {
        if (groupId !== NO_GROUP) payload.group_id = groupId
        const { id } = await createProject(payload as unknown as ProjectCreate)
        toast.success("Đã tạo dự án")
        setOpen(false)
        router.push(`/campaigns/${id}`)
      } else if (project) {
        await updateProject(project.id, payload as unknown as ProjectFormUpdate)
        toast.success("Đã lưu thay đổi")
        setOpen(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger render={trigger} />
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {mode === "create" ? "Tạo dự án mới" : "Chỉnh sửa dự án"}
          </SheetTitle>
        </SheetHeader>
        <form
          id="project-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="p-name">Tên dự án *</FieldLabel>
              <Input
                id="p-name"
                value={values.name}
                onChange={set("name")}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-objective">Mục tiêu dự án *</FieldLabel>
              <Textarea
                id="p-objective"
                value={values.objective}
                onChange={set("objective")}
                rows={2}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-description">Mô tả chi tiết</FieldLabel>
              <Textarea
                id="p-description"
                value={values.description}
                onChange={set("description")}
                rows={3}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-scale">Quy mô dự án</FieldLabel>
              <Input id="p-scale" value={values.scale} onChange={set("scale")} />
            </Field>
            {mode === "create" && (
              <Field>
                <FieldLabel htmlFor="p-group">Nhóm dự án</FieldLabel>
                <Select value={groupId} onValueChange={(v) => v && setGroupId(v)}>
                  <SelectTrigger id="p-group" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUP}>Chưa phân nhóm</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="p-sheet">
                Tiến độ dự án (link Google Sheets)
              </FieldLabel>
              <Input
                id="p-sheet"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={values.progress_sheet_url}
                onChange={set("progress_sheet_url")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-retro">Đúc kết sau dự án</FieldLabel>
              <Textarea
                id="p-retro"
                value={values.retrospective}
                onChange={set("retrospective")}
                rows={3}
              />
            </Field>
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button type="submit" form="project-form" disabled={submitting}>
            {submitting
              ? "Đang lưu..."
              : mode === "create"
                ? "Tạo dự án"
                : "Lưu thay đổi"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
