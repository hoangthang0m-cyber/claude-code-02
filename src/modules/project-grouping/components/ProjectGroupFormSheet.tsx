"use client"

import * as React from "react"
import { toast } from "sonner"

import type {
  ProjectGroup,
  ProjectGroupCreate,
  ProjectGroupUpdate,
} from "@/lib/domain"
import {
  createProjectGroup,
  updateProjectGroup,
} from "@/modules/project-grouping/services/projectGroups.client"
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

// project-group-fields task 2.2 — the create / edit form for a project group.
// Mirrors ProjectFormSheet. A group is NOT a project: no synced progress link,
// no retrospective. `objective` is required (task 1.2); the budget is a pair —
// an amount only ships together with a currency.

const CURRENCIES = ["VND", "USD"] as const

type Values = {
  name: string
  objective: string
  description: string
  time_scope_text: string
  target_end_date: string
  budget_amount: string
  budget_currency: string
}

function toValues(group?: ProjectGroup): Values {
  return {
    name: group?.name ?? "",
    objective: group?.objective ?? "",
    description: group?.description ?? "",
    time_scope_text: group?.time_scope_text ?? "",
    target_end_date: group?.target_end_date ?? "",
    budget_amount:
      group?.budget_amount != null ? String(group.budget_amount) : "",
    budget_currency: group?.budget_currency ?? "VND",
  }
}

// Only the fields the manager actually filled in. `budget_currency` rides along
// only when there is an amount — a lone currency fails the server's pair check.
function toPayload(v: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const name = v.name.trim()
  if (name) out.name = name
  const objective = v.objective.trim()
  if (objective) out.objective = objective
  const description = v.description.trim()
  if (description) out.description = description
  const timeScope = v.time_scope_text.trim()
  if (timeScope) out.time_scope_text = timeScope
  const targetEnd = v.target_end_date.trim()
  if (targetEnd) out.target_end_date = targetEnd
  const amount = v.budget_amount.trim()
  if (amount) {
    out.budget_amount = Number(amount)
    out.budget_currency = v.budget_currency.trim() || "VND"
  }
  return out
}

export function ProjectGroupFormSheet({
  mode,
  group,
  trigger,
}: {
  mode: "create" | "edit"
  group?: ProjectGroup
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState<Values>(toValues(group))
  const [submitting, setSubmitting] = React.useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setValues(toValues(group))
  }

  const set =
    (k: keyof Values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!values.name.trim() || !values.objective.trim()) {
      toast.error("Cần nhập tên nhóm và mục tiêu")
      return
    }
    if (values.budget_amount.trim() && !(Number(values.budget_amount) > 0)) {
      toast.error("Ngân sách dự kiến phải là số lớn hơn 0")
      return
    }
    setSubmitting(true)
    try {
      const payload = toPayload(values)
      if (mode === "create") {
        await createProjectGroup(payload as unknown as ProjectGroupCreate)
        toast.success("Đã tạo nhóm")
      } else if (group) {
        await updateProjectGroup(
          group.id,
          payload as unknown as ProjectGroupUpdate
        )
        toast.success("Đã lưu thay đổi")
      }
      setOpen(false)
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
            {mode === "create" ? "Tạo nhóm dự án" : "Chỉnh sửa nhóm"}
          </SheetTitle>
        </SheetHeader>
        <form
          id="project-group-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="g-name">Tên nhóm *</FieldLabel>
              <Input
                id="g-name"
                value={values.name}
                onChange={set("name")}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="g-objective">Mục tiêu nhóm *</FieldLabel>
              <Textarea
                id="g-objective"
                value={values.objective}
                onChange={set("objective")}
                rows={2}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="g-description">Mô tả chi tiết</FieldLabel>
              <Textarea
                id="g-description"
                value={values.description}
                onChange={set("description")}
                rows={3}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="g-scope">Quy mô thời gian</FieldLabel>
              <Input
                id="g-scope"
                placeholder="vd: 3 tháng, Quý 3/2026"
                value={values.time_scope_text}
                onChange={set("time_scope_text")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="g-end">Ngày kết thúc dự kiến</FieldLabel>
              <Input
                id="g-end"
                type="date"
                value={values.target_end_date}
                onChange={set("target_end_date")}
              />
              <p className="text-xs text-muted-foreground">
                Chỉ dùng để tính tình trạng thời gian trên trang tổng hợp.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="g-budget">Ngân sách dự kiến</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="g-budget"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="vd: 100000000"
                  className="flex-1"
                  value={values.budget_amount}
                  onChange={set("budget_amount")}
                />
                <Select
                  value={values.budget_currency}
                  onValueChange={(v) =>
                    v && setValues((prev) => ({ ...prev, budget_currency: v }))
                  }
                >
                  <SelectTrigger size="sm" className="w-24">
                    <SelectValue>{values.budget_currency}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Field>
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button type="submit" form="project-group-form" disabled={submitting}>
            {submitting
              ? "Đang lưu..."
              : mode === "create"
                ? "Tạo nhóm"
                : "Lưu thay đổi"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
