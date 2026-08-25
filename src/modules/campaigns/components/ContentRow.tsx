"use client"

import * as React from "react"
import { Timestamp } from "firebase/firestore"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/utils/cn"
import { AssigneeSelect } from "@/modules/campaigns/components/AssigneeSelect"
import { OnDeadlineSelect } from "@/modules/campaigns/components/OnDeadlineSelect"
import { StatusSelect } from "@/modules/campaigns/components/StatusSelect"
import { VideoLinkUploader } from "@/modules/campaigns/components/VideoLinkUploader"
import {
  deleteContentItem,
  updateContentItem,
} from "@/modules/campaigns/services/contentItems.service"
import type { ContentItem } from "@/modules/campaigns/types/campaign.types"
import { FileVideoIcon, Trash2Icon } from "lucide-react"

function toDateInputValue(timestamp?: Timestamp) {
  if (!timestamp) return ""
  return timestamp.toDate().toISOString().slice(0, 10)
}

function deadlineCellClass(item: ContentItem) {
  if (!item.deadline) return ""
  const isOverdue = item.deadline.toMillis() < Date.now() && item.status !== "posted_ads"
  return isOverdue
    ? "bg-destructive/10 text-destructive"
    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
}

export function ContentRow({
  campaignId,
  item,
  onOpenDetail,
}: {
  campaignId: string
  item: ContentItem
  onOpenDetail: (item: ContentItem) => void
}) {
  const [scriptTitle, setScriptTitle] = React.useState(item.scriptTitle)
  const [topic, setTopic] = React.useState(item.topic ?? "")
  const [videoSheetOpen, setVideoSheetOpen] = React.useState(false)
  const [syncedScriptTitle, setSyncedScriptTitle] = React.useState(item.scriptTitle)
  const [syncedTopic, setSyncedTopic] = React.useState(item.topic ?? "")

  if (item.scriptTitle !== syncedScriptTitle) {
    setSyncedScriptTitle(item.scriptTitle)
    setScriptTitle(item.scriptTitle)
  }
  if ((item.topic ?? "") !== syncedTopic) {
    setSyncedTopic(item.topic ?? "")
    setTopic(item.topic ?? "")
  }

  function update(data: Parameters<typeof updateContentItem>[2]) {
    return updateContentItem(campaignId, item.id, data)
  }

  return (
    <TableRow className="animate-in fade-in duration-300 fill-mode-both">
      <TableCell className={cn("min-w-32", deadlineCellClass(item))}>
        <Input
          type="date"
          className="h-7 bg-transparent"
          value={toDateInputValue(item.deadline)}
          onChange={(e) =>
            update({
              deadline: e.target.value ? Timestamp.fromDate(new Date(e.target.value)) : undefined,
            })
          }
        />
      </TableCell>
      <TableCell className="min-w-36">
        <AssigneeSelect
          value={item.assigneeId}
          onChange={(assigneeId) => update({ assigneeId })}
        />
      </TableCell>
      <TableCell className="min-w-40">
        <Input
          className="h-7"
          value={scriptTitle}
          onChange={(e) => setScriptTitle(e.target.value)}
          onBlur={() => update({ scriptTitle })}
        />
      </TableCell>
      <TableCell className="min-w-40">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-w-full justify-start"
          onClick={() => setVideoSheetOpen(true)}
        >
          <FileVideoIcon />
          <span className="truncate">{item.videoFile?.fileName ?? "Thêm video"}</span>
        </Button>
        <Sheet open={videoSheetOpen} onOpenChange={setVideoSheetOpen}>
          <SheetContent className="sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Video — {item.scriptTitle || "Content"}</SheetTitle>
            </SheetHeader>
            <div className="px-4">
              <VideoLinkUploader
                campaignId={campaignId}
                contentItemId={item.id}
                videoFile={item.videoFile}
                onChange={(videoFile) => update({ videoFile })}
              />
            </div>
          </SheetContent>
        </Sheet>
      </TableCell>
      <TableCell className="min-w-36">
        <StatusSelect value={item.status} onChange={(status) => update({ status })} />
      </TableCell>
      <TableCell className="min-w-36">
        <Input
          className="h-7"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onBlur={() => update({ topic })}
        />
      </TableCell>
      <TableCell className="min-w-36">
        <OnDeadlineSelect
          value={item.onDeadlineStatus}
          onChange={(onDeadlineStatus) => update({ onDeadlineStatus })}
        />
      </TableCell>
      <TableCell className="min-w-48 max-w-64 whitespace-normal">
        <button
          type="button"
          className="line-clamp-2 w-full text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => onOpenDetail(item)}
        >
          {item.adsPerformanceReport || "Thêm báo cáo..."}
        </button>
      </TableCell>
      <TableCell className="min-w-48 max-w-64 whitespace-normal">
        <button
          type="button"
          className="line-clamp-2 w-full text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => onOpenDetail(item)}
        >
          {item.evaluationNote || "Thêm đánh giá..."}
        </button>
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            if (window.confirm("Xóa content này?")) {
              deleteContentItem(campaignId, item.id)
            }
          }}
        >
          <Trash2Icon />
          <span className="sr-only">Xóa</span>
        </Button>
      </TableCell>
    </TableRow>
  )
}
