"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"
import {
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

export interface UploadedFile {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSizeBytes: number
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeIcon({ fileType, className }: { fileType: string; className?: string }) {
  if (fileType.startsWith("video/")) return <FileVideoIcon className={className} />
  if (fileType.includes("spreadsheet") || fileType.includes("excel"))
    return <FileSpreadsheetIcon className={className} />
  if (fileType.includes("word") || fileType.includes("document"))
    return <FileTextIcon className={className} />
  return <FileIcon className={className} />
}

export function FileUploader({
  label,
  attachments,
  accept,
  maxBytes,
  multiple = true,
  disabled,
  onUpload,
  onDelete,
  emptyLabel = "Chưa có tệp.",
  className,
}: {
  label: string
  attachments: UploadedFile[]
  accept?: string
  maxBytes: number
  multiple?: boolean
  disabled?: boolean
  onUpload: (file: File) => Promise<void>
  onDelete: (attachment: UploadedFile) => Promise<void>
  emptyLabel?: string
  className?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.size > maxBytes) {
      setError(`File vượt quá giới hạn ${formatBytes(maxBytes)}.`)
      return
    }

    setError(null)
    setIsUploading(true)
    try {
      await onUpload(file)
    } catch {
      setError("Tải file lên thất bại, thử lại sau.")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon />
          {isUploading ? "Đang tải..." : "Tải file lên"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
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
                <FileTypeIcon fileType={attachment.fileType} className="size-3.5 shrink-0" />
                <span className="truncate">{attachment.fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({formatBytes(attachment.fileSizeBytes)})
                </span>
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(attachment)}
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
