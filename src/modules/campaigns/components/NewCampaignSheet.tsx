"use client"

import * as React from "react"
import { Timestamp } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { createCampaign } from "@/modules/campaigns/services/campaigns.service"
import type { CampaignFormValues } from "@/modules/campaigns/types/campaign.types"
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
import { CAMPAIGN_PRIORITIES, CAMPAIGN_PRIORITY_LABELS } from "@/constants/priority"
import { PlusIcon } from "lucide-react"

const EMPTY_FORM: CampaignFormValues = {
  title: "",
  priority: "medium",
  status: "todo",
  assigneeId: "",
  dueDate: "",
  description: "",
  tags: "",
}

export function NewCampaignSheet() {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<CampaignFormValues>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !form.title.trim()) return
    setIsSubmitting(true)
    try {
      await createCampaign({
        title: form.title.trim().slice(0, 200),
        priority: form.priority,
        status: "todo",
        assigneeId: form.assigneeId || undefined,
        dueDate: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : undefined,
        description: form.description || undefined,
        tags: form.tags
          ? form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          : undefined,
        createdBy: user.uid,
      })
      setForm(EMPTY_FORM)
      setOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        New campaign
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New campaign</SheetTitle>
        </SheetHeader>
        <form
          id="new-campaign-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 px-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="campaign-title">Title</FieldLabel>
              <Input
                id="campaign-title"
                value={form.title}
                maxLength={200}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-assignee">Assignee</FieldLabel>
              <Input
                id="campaign-assignee"
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-due-date">Due date</FieldLabel>
              <Input
                id="campaign-due-date"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Priority</FieldLabel>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  setForm({ ...form, priority: value as CampaignFormValues["priority"] })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {CAMPAIGN_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-description">Description</FieldLabel>
              <Textarea
                id="campaign-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-tags">Tags (phân cách bằng dấu phẩy)</FieldLabel>
              <Input
                id="campaign-tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </Field>
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button type="submit" form="new-campaign-form" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create campaign"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
