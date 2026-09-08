"use client"

import * as React from "react"
import Link from "next/link"
import { PlusIcon } from "lucide-react"

import { KNOWLEDGE_LIFECYCLE_LABELS } from "@/lib/domain"
import { useKnowledgeEntries } from "@/modules/knowledge/hooks/useKnowledgeEntries"
import { KnowledgeEntryFormSheet } from "@/modules/knowledge/components/KnowledgeEntryFormSheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

const fmt = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString("vi-VN") : "—"
const toMs = (v: unknown) =>
  (v as { toMillis?: () => number })?.toMillis?.() ?? null

export function KnowledgeList() {
  const [includeArchived, setIncludeArchived] = React.useState(false)
  const [q, setQ] = React.useState("")
  const { entries, loading } = useKnowledgeEntries({ includeArchived })

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle
      ? entries.filter((e) => e.name.toLowerCase().includes(needle))
      : entries
  }, [entries, q])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Tri thức</h1>
        <p className="text-sm text-muted-foreground">
          Kho đúc kết & công thức vận hành của phòng. Hệ thống chỉ lưu và mở
          link — không đọc nội dung, không đồng bộ.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-56"
          placeholder="Tìm theo tên…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Checkbox
            checked={includeArchived}
            onCheckedChange={(c) => setIncludeArchived(c === true)}
          />
          Hiện đã lưu trữ
        </label>
        <KnowledgeEntryFormSheet
          mode="create"
          trigger={
            <Button size="sm" className="ml-auto">
              <PlusIcon /> Tạo tri thức
            </Button>
          }
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {q.trim()
            ? "Không có tri thức nào khớp."
            : "Chưa có tri thức nào. Bấm “Tạo tri thức” để thêm mục đầu tiên."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map((e) => (
            <li key={e.id}>
              <Link href={`/knowledge/${e.id}`} className="block h-full">
                <Card className="h-full gap-2 p-4 transition-shadow hover:ring-primary/40 hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.4)]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{e.name}</span>
                    {e.lifecycle === "archived" && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {KNOWLEDGE_LIFECYCLE_LABELS.archived}
                      </Badge>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {e.overview}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    Cập nhật {fmt(toMs(e.updated_at))}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
