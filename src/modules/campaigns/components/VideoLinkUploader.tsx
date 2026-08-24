"use client"

import * as React from "react"
import { Timestamp } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileUploader } from "@/components/forms/FileUploader"
import { VIDEO_ACCEPT, MAX_VIDEO_FILE_BYTES } from "@/config/upload"
import {
  deleteContentFileFromStorage,
  uploadContentFile,
} from "@/modules/campaigns/services/contentItems.service"
import type { Attachment } from "@/modules/campaigns/types/campaign.types"

export function VideoLinkUploader({
  campaignId,
  contentItemId,
  videoFile,
  onChange,
}: {
  campaignId: string
  contentItemId: string
  videoFile?: Attachment
  onChange: (next: Attachment | undefined) => Promise<void>
}) {
  const { user } = useAuth()
  const [link, setLink] = React.useState("")

  async function handleSaveLink() {
    if (!link.trim() || !user) return
    const attachment: Attachment = {
      id: crypto.randomUUID(),
      fileName: link.trim(),
      fileUrl: link.trim(),
      fileType: "link",
      fileSizeBytes: 0,
      uploadedBy: user.uid,
      uploadedAt: Timestamp.now(),
    }
    await onChange(attachment)
    setLink("")
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Dán link video..."
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <Button type="button" size="sm" variant="outline" onClick={handleSaveLink} disabled={!link.trim()}>
          Lưu link
        </Button>
      </div>
      <FileUploader
        label="Video"
        accept={VIDEO_ACCEPT}
        maxBytes={MAX_VIDEO_FILE_BYTES}
        multiple={false}
        emptyLabel="Chưa có video."
        attachments={videoFile ? [videoFile] : []}
        onUpload={async (file) => {
          if (!user) return
          const attachment = await uploadContentFile(campaignId, contentItemId, file, user.uid)
          await onChange(attachment)
        }}
        onDelete={async (attachment) => {
          if (attachment.fileType !== "link") {
            await deleteContentFileFromStorage(campaignId, contentItemId, attachment)
          }
          await onChange(undefined)
        }}
      />
    </div>
  )
}
