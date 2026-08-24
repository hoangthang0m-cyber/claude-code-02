"use client"

import * as React from "react"

import { useAuth } from "@/context/AuthContext"
import { createCampaign } from "@/modules/campaigns/services/campaigns.service"
import type { CampaignCategorySlug } from "@/constants/campaignCategories"
import type { CampaignFormValues } from "@/modules/campaigns/types/campaign.types"
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
import { PlusIcon } from "lucide-react"

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export function NewCampaignSheet({ categoryId }: { categoryId: CampaignCategorySlug }) {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<CampaignFormValues>({ title: "", month: currentMonth() })
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !form.month) return
    setIsSubmitting(true)
    try {
      await createCampaign({
        categoryId,
        title: form.title.trim().slice(0, 200),
        month: form.month,
        createdBy: user.uid,
      })
      setForm({ title: "", month: currentMonth() })
      setOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Tạo chiến dịch mới
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Tạo chiến dịch mới</SheetTitle>
        </SheetHeader>
        <form
          id="new-campaign-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 px-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="campaign-month">Tháng</FieldLabel>
              <Input
                id="campaign-month"
                type="month"
                value={form.month}
                onChange={(e) => setForm({ ...form, month: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-title">Tên chiến dịch (tùy chọn)</FieldLabel>
              <Input
                id="campaign-title"
                placeholder="VD: Chiến dịch tháng 8/2026"
                value={form.title}
                maxLength={200}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button type="submit" form="new-campaign-form" disabled={isSubmitting}>
            {isSubmitting ? "Đang tạo..." : "Tạo chiến dịch"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
