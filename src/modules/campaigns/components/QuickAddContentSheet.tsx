"use client"

import * as React from "react"
import { Timestamp } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
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
import { AssigneeSelect } from "@/modules/campaigns/components/AssigneeSelect"
import { PrioritySelect } from "@/modules/campaigns/components/PrioritySelect"
import { importContentItem } from "@/modules/campaigns/services/contentItems.service"
import type { Campaign, PriorityLevel } from "@/modules/campaigns/types/campaign.types"
import { formatMonth } from "@/utils/date"
import { PlusIcon } from "lucide-react"

export function QuickAddContentSheet({ campaigns }: { campaigns: Campaign[] }) {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [campaignId, setCampaignId] = React.useState(campaigns[0]?.id ?? "")
  const [scriptTitle, setScriptTitle] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState<string>()
  const [deadline, setDeadline] = React.useState("")
  const [priority, setPriority] = React.useState<PriorityLevel>()
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const [syncedCampaignsKey, setSyncedCampaignsKey] = React.useState(campaigns[0]?.id)
  if (campaigns[0]?.id !== syncedCampaignsKey) {
    setSyncedCampaignsKey(campaigns[0]?.id)
    if (!campaignId) setCampaignId(campaigns[0]?.id ?? "")
  }

  function resetForm() {
    setScriptTitle("")
    setAssigneeId(undefined)
    setDeadline("")
    setPriority(undefined)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !campaignId) return
    setIsSubmitting(true)
    try {
      await importContentItem(campaignId, user.uid, {
        scriptTitle: scriptTitle.trim(),
        assigneeId,
        priority,
        deadline: deadline ? Timestamp.fromDate(new Date(deadline)) : undefined,
      })
      resetForm()
      setOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>
        <PlusIcon />
        Thêm việc
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Thêm công việc mới</SheetTitle>
        </SheetHeader>
        {campaigns.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">
            Nhóm này chưa có chiến dịch theo tháng nào — tạo chiến dịch trước khi thêm việc.
          </p>
        ) : (
          <form
            id="quick-add-content-form"
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-4 px-4"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="qa-campaign">Chiến dịch (tháng)</FieldLabel>
                <Select value={campaignId} onValueChange={(value) => setCampaignId(value ?? "")}>
                  <SelectTrigger id="qa-campaign" className="w-full">
                    <SelectValue placeholder="Chọn chiến dịch" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.title || formatMonth(campaign.month)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="qa-title">Tiêu đề / Kịch bản</FieldLabel>
                <Input
                  id="qa-title"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>Nhân sự thực hiện</FieldLabel>
                <AssigneeSelect value={assigneeId} onChange={setAssigneeId} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="qa-deadline">Deadline</FieldLabel>
                  <Input
                    id="qa-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Mức ưu tiên</FieldLabel>
                  <PrioritySelect value={priority} onChange={setPriority} />
                </Field>
              </div>
            </FieldGroup>
          </form>
        )}
        <SheetFooter>
          <Button
            type="submit"
            form="quick-add-content-form"
            disabled={isSubmitting || campaigns.length === 0}
          >
            {isSubmitting ? "Đang thêm..." : "Thêm công việc"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
