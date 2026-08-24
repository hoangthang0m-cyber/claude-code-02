"use client"

import * as React from "react"
import { Timestamp } from "firebase/firestore"

import { deleteCampaign, updateCampaign } from "@/modules/campaigns/services/campaigns.service"
import { CampaignAttachments } from "@/modules/campaigns/components/CampaignAttachments"
import { CampaignComments } from "@/modules/campaigns/components/CampaignComments"
import { useCampaign } from "@/modules/campaigns/hooks/useCampaign"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"
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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { CAMPAIGN_PRIORITIES, CAMPAIGN_PRIORITY_LABELS } from "@/constants/priority"
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS } from "@/constants/status"
import { Trash2Icon } from "lucide-react"

function toDateInputValue(timestamp?: Timestamp) {
  if (!timestamp) return ""
  return timestamp.toDate().toISOString().slice(0, 10)
}

export function CampaignDetailBody({
  campaignId,
  onDeleted,
}: {
  campaignId: string
  onDeleted?: () => void
}) {
  const { campaign, loading } = useCampaign(campaignId)

  if (loading) {
    return <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
  }

  if (!campaign) {
    return <p className="px-4 text-sm text-muted-foreground">Không tìm thấy chiến dịch.</p>
  }

  return <CampaignDetailFields key={campaign.id} campaign={campaign} onDeleted={onDeleted} />
}

function CampaignDetailFields({
  campaign,
  onDeleted,
}: {
  campaign: Campaign
  onDeleted?: () => void
}) {
  const [title, setTitle] = React.useState(campaign.title)
  const [description, setDescription] = React.useState(campaign.description ?? "")
  const [assigneeId, setAssigneeId] = React.useState(campaign.assigneeId ?? "")
  const [tags, setTags] = React.useState((campaign.tags ?? []).join(", "))

  function saveField(data: Parameters<typeof updateCampaign>[1]) {
    updateCampaign(campaign.id, data)
  }

  async function handleDelete() {
    await deleteCampaign(campaign.id)
    onDeleted?.()
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="detail-title">Title</FieldLabel>
          <Input
            id="detail-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && saveField({ title: title.trim() })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Select
              value={campaign.status}
              onValueChange={(value) => saveField({ status: value as typeof campaign.status })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {CAMPAIGN_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Priority</FieldLabel>
            <Select
              value={campaign.priority}
              onValueChange={(value) =>
                saveField({ priority: value as typeof campaign.priority })
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="detail-assignee">Assignee</FieldLabel>
            <Input
              id="detail-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              onBlur={() => saveField({ assigneeId })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="detail-due-date">Due date</FieldLabel>
            <Input
              id="detail-due-date"
              type="date"
              defaultValue={toDateInputValue(campaign.dueDate)}
              onChange={(e) =>
                saveField({
                  dueDate: e.target.value
                    ? Timestamp.fromDate(new Date(e.target.value))
                    : undefined,
                })
              }
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="detail-description">Description</FieldLabel>
          <Textarea
            id="detail-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => saveField({ description })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="detail-tags">Tags (phân cách bằng dấu phẩy)</FieldLabel>
          <Input
            id="detail-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() =>
              saveField({
                tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
              })
            }
          />
        </Field>
      </FieldGroup>

      <Separator />
      <CampaignAttachments campaignId={campaign.id} attachments={campaign.attachments ?? []} />

      <Separator />
      <CampaignComments campaignId={campaign.id} />

      <Separator />
      <Button variant="destructive" onClick={handleDelete}>
        <Trash2Icon />
        Xóa chiến dịch
      </Button>
    </div>
  )
}
