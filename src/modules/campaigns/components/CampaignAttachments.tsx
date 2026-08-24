"use client"

import * as React from "react"

import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import {
  deleteCampaignAttachment,
  MAX_ATTACHMENT_BYTES,
  uploadCampaignAttachment,
} from "@/modules/campaigns/services/campaigns.service"
import type { Attachment } from "@/modules/campaigns/types/campaign.types"
import { PaperclipIcon, Trash2Icon, UploadIcon } from "lucide-react"

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CampaignAttachments({
  campaignId,
  attachments,
}: {
  campaignId: string
  attachments: Attachment[]
}) {
  const { user } = useAuth()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !user) return

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("File vượt quá giới hạn 10MB.")
      return
    }

    setError(null)
    setIsUploading(true)
    try {
      await uploadCampaignAttachment(campaignId, file, user.uid, attachments)
    } catch {
      setError("Tải file lên thất bại, thử lại sau.")
    } finally {
      setIsUploading(false)
    }
  }

  async function handleDelete(attachment: Attachment) {
    await deleteCampaignAttachment(campaignId, attachment, attachments)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Tệp đính kèm</p>
        <Button
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon />
          {isUploading ? "Đang tải..." : "Tải file lên"}
        </Button>
        <input ref={inputRef} type="file" hidden onChange={handleFileChange} />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có tệp đính kèm.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <a
                href={attachment.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1.5 hover:underline"
              >
                <PaperclipIcon className="size-3.5 shrink-0" />
                <span className="truncate">{attachment.fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({formatBytes(attachment.fileSizeBytes)})
                </span>
              </a>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDelete(attachment)}
              >
                <Trash2Icon />
                <span className="sr-only">Xóa</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
