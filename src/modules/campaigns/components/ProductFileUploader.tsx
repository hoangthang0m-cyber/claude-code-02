"use client"

import { useAuth } from "@/context/AuthContext"
import { FileUploader } from "@/components/forms/FileUploader"
import { MAX_PRODUCT_FILE_BYTES, PRODUCT_FILE_ACCEPT } from "@/config/upload"
import {
  deleteContentFileFromStorage,
  uploadContentFile,
} from "@/modules/campaigns/services/contentItems.service"
import type { Attachment } from "@/modules/campaigns/types/campaign.types"

export function ProductFileUploader({
  campaignId,
  contentItemId,
  productFiles,
  onChange,
}: {
  campaignId: string
  contentItemId: string
  productFiles: Attachment[]
  onChange: (next: Attachment[]) => Promise<void>
}) {
  const { user } = useAuth()

  return (
    <FileUploader
      label="File sản phẩm (docx, xlsx, pdf...)"
      accept={PRODUCT_FILE_ACCEPT}
      maxBytes={MAX_PRODUCT_FILE_BYTES}
      multiple
      emptyLabel="Chưa có file sản phẩm."
      attachments={productFiles}
      onUpload={async (file) => {
        if (!user) return
        const attachment = await uploadContentFile(campaignId, contentItemId, file, user.uid)
        await onChange([...productFiles, attachment])
      }}
      onDelete={async (attachment) => {
        await deleteContentFileFromStorage(campaignId, contentItemId, attachment)
        await onChange(productFiles.filter((item) => item.id !== attachment.id))
      }}
    />
  )
}
