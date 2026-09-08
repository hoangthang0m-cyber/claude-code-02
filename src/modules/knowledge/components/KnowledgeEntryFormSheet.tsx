"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type {
  KnowledgeEntry,
  KnowledgeEntryCreate,
  KnowledgeEntryUpdate,
} from "@/lib/domain"
import {
  createKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/modules/knowledge/services/knowledge.client"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

// Create / edit a knowledge entry (mẫu ProjectGroupFormSheet). `name` +
// `overview` required; the three section notes are optional free text.

type Values = {
  name: string
  overview: string
  detail_note: string
  process_note: string
  conclusion_note: string
}

function toValues(entry?: KnowledgeEntry): Values {
  return {
    name: entry?.name ?? "",
    overview: entry?.overview ?? "",
    detail_note: entry?.detail_note ?? "",
    process_note: entry?.process_note ?? "",
    conclusion_note: entry?.conclusion_note ?? "",
  }
}

export function KnowledgeEntryFormSheet({
  mode,
  entry,
  trigger,
}: {
  mode: "create" | "edit"
  entry?: KnowledgeEntry
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState<Values>(toValues(entry))
  const [submitting, setSubmitting] = React.useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setValues(toValues(entry))
  }

  const set =
    (k: keyof Values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!values.name.trim() || !values.overview.trim()) {
      toast.error("Cần nhập tên và mô tả tổng quan")
      return
    }
    setSubmitting(true)
    try {
      if (mode === "create") {
        const payload: KnowledgeEntryCreate = {
          name: values.name.trim(),
          overview: values.overview.trim(),
        }
        if (values.detail_note.trim()) payload.detail_note = values.detail_note.trim()
        if (values.process_note.trim()) payload.process_note = values.process_note.trim()
        if (values.conclusion_note.trim())
          payload.conclusion_note = values.conclusion_note.trim()
        const { id } = await createKnowledgeEntry(payload)
        toast.success("Đã tạo tri thức")
        setOpen(false)
        router.push(`/knowledge/${id}`)
      } else if (entry) {
        const payload: KnowledgeEntryUpdate = {
          name: values.name.trim(),
          overview: values.overview.trim(),
          detail_note: values.detail_note.trim() || null,
          process_note: values.process_note.trim() || null,
          conclusion_note: values.conclusion_note.trim() || null,
        }
        await updateKnowledgeEntry(entry.id, payload)
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
            {mode === "create" ? "Tạo tri thức" : "Chỉnh sửa tri thức"}
          </SheetTitle>
        </SheetHeader>
        <form
          id="knowledge-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="k-name">Tên *</FieldLabel>
              <Input
                id="k-name"
                value={values.name}
                onChange={set("name")}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="k-overview">Mô tả tổng quan *</FieldLabel>
              <Textarea
                id="k-overview"
                value={values.overview}
                onChange={set("overview")}
                rows={3}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="k-detail">Mô tả chi tiết</FieldLabel>
              <Textarea
                id="k-detail"
                value={values.detail_note}
                onChange={set("detail_note")}
                rows={4}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="k-process">Quá trình đúc kết</FieldLabel>
              <Textarea
                id="k-process"
                value={values.process_note}
                onChange={set("process_note")}
                rows={4}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="k-conclusion">Đúc kết</FieldLabel>
              <Textarea
                id="k-conclusion"
                value={values.conclusion_note}
                onChange={set("conclusion_note")}
                rows={4}
              />
            </Field>
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button type="submit" form="knowledge-form" disabled={submitting}>
            {submitting
              ? "Đang lưu..."
              : mode === "create"
                ? "Tạo tri thức"
                : "Lưu thay đổi"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
