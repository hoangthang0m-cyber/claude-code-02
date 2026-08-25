"use client"

import * as React from "react"
import { Timestamp } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { parseCsv } from "@/utils/csv"
import { slugify } from "@/utils/slug"
import type { ContentStatus } from "@/constants/contentStatus"
import { importContentItem } from "@/modules/campaigns/services/contentItems.service"
import type { Attachment, ContentItem } from "@/modules/campaigns/types/campaign.types"
import { UploadIcon } from "lucide-react"

const HEADER_ALIASES: Record<string, string> = {
  deadline: "deadline",
  "nhân sự thực hiện": "assignee",
  "kịch bản": "scriptTitle",
  "link video": "videoLabel",
  "trạng thái": "status",
  "chủ đề": "topic",
  "báo cáo hiệu quả ads": "adsPerformanceReport",
  "đánh giá/đề xuất": "evaluationNote",
}

const STATUS_ALIASES: Record<string, ContentStatus> = {
  "chưa làm": "draft",
  "đang quay": "recording",
  "đang dựng": "recording",
  "đang quay/dựng": "recording",
  "đã duyệt": "ready_to_post",
  "sẵn sàng đăng": "ready_to_post",
  "đã lên ads": "posted_ads",
}

function parseDeadline(value: string): Timestamp | undefined {
  const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return undefined
  const [, day, month, year] = match
  return Timestamp.fromDate(new Date(Number(year), Number(month) - 1, Number(day)))
}

function buildRows(csvText: string) {
  const rows = parseCsv(csvText)
  const headerIndex = rows.findIndex((row) => row[0]?.trim().toLowerCase() === "deadline")
  if (headerIndex === -1) {
    throw new Error("Không tìm thấy dòng tiêu đề — cột đầu tiên phải là \"Deadline\".")
  }

  const columnKeyByIndex = rows[headerIndex].map(
    (header) => HEADER_ALIASES[header.trim().toLowerCase()]
  )

  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const values: Record<string, string> = {}
      columnKeyByIndex.forEach((key, index) => {
        if (key) values[key] = (row[index] ?? "").trim()
      })

      const scriptTitle = values.scriptTitle || values.videoLabel || ""
      const assigneeName = values.assignee || ""
      const status = STATUS_ALIASES[(values.status ?? "").toLowerCase()] ?? "draft"

      let evaluationNote = values.evaluationNote || ""
      if (assigneeName) {
        evaluationNote = evaluationNote
          ? `Nhân sự: ${assigneeName}\n\n${evaluationNote}`
          : `Nhân sự: ${assigneeName}`
      }

      const payload: Partial<Omit<ContentItem, "id" | "campaignId" | "createdAt" | "createdBy" | "updatedAt">> =
        {
          scriptTitle,
          status,
          topic: values.topic || undefined,
          adsPerformanceReport: values.adsPerformanceReport || undefined,
          evaluationNote: evaluationNote || undefined,
          deadline: values.deadline ? parseDeadline(values.deadline) : undefined,
          assigneeId: assigneeName ? slugify(assigneeName) : undefined,
        }

      return { payload, videoLabel: values.videoLabel || "" }
    })
}

export function ImportContentCsvSheet({ campaignId }: { campaignId: string }) {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [csvText, setCsvText] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)

  async function handleImport() {
    if (!user) return
    setError(null)

    let rows: ReturnType<typeof buildRows>
    try {
      rows = buildRows(csvText)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đọc được dữ liệu CSV.")
      return
    }

    if (rows.length === 0) {
      setError("Không tìm thấy dòng dữ liệu nào để nhập.")
      return
    }

    setProgress({ done: 0, total: rows.length })
    let done = 0
    try {
      for (const row of rows) {
        const videoFile: Attachment | undefined = row.videoLabel
          ? {
              id: crypto.randomUUID(),
              fileName: row.videoLabel,
              fileUrl: "",
              fileType: "link",
              fileSizeBytes: 0,
              uploadedBy: user.uid,
              uploadedAt: Timestamp.now(),
            }
          : undefined

        await importContentItem(campaignId, user.uid, { ...row.payload, videoFile })
        done += 1
        setProgress({ done, total: rows.length })
      }
    } catch (err) {
      console.error("CSV import failed", err)
      setError(
        `Nhập dữ liệu thất bại ở dòng ${done + 1}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      setProgress(null)
      return
    }

    setCsvText("")
    setProgress(null)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <UploadIcon />
        Nhập từ CSV
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Nhập content từ CSV</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 px-4">
          <p className="text-xs text-muted-foreground">
            Dán dữ liệu CSV có dòng tiêu đề gồm các cột: Deadline, Nhân sự thực hiện, Kịch bản,
            Link video, Trạng thái, Chủ đề, Báo cáo hiệu quả ads, Đánh giá/Đề xuất (thứ tự cột không
            bắt buộc, cột lạ sẽ bị bỏ qua).
          </p>
          <Textarea
            rows={14}
            className="font-mono text-xs"
            placeholder="Dán nội dung CSV vào đây..."
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {progress && (
            <p className="text-sm text-muted-foreground">
              Đang nhập {progress.done}/{progress.total}...
            </p>
          )}
        </div>
        <SheetFooter>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!csvText.trim() || progress !== null}
          >
            {progress ? "Đang nhập..." : "Nhập dữ liệu"}
          </Button>
          <SheetClose render={<Button type="button" variant="outline" />}>Đóng</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
