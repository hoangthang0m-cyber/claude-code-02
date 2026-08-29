"use client"

import { useProgressDashboard } from "@/modules/analytics/hooks/useProgressDashboard"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const CARDS: Array<{
  key: "total" | "in_production" | "pending_review" | "overdue" | "published" | "ads_running"
  label: string
  tone?: "danger"
}> = [
  { key: "total", label: "Tổng hạng mục" },
  { key: "in_production", label: "Đang sản xuất" },
  { key: "pending_review", label: "Chờ duyệt" },
  { key: "overdue", label: "Quá hạn", tone: "danger" },
  { key: "published", label: "Đã lên ads" },
  { key: "ads_running", label: "Ads đang chạy" },
]

// SPEC §5.6 R1, task 8.6: the live progress cards.
export function StatCards() {
  const { data, error, loading, realtimeStatus } = useProgressDashboard()

  if (error) return <p className="text-sm text-destructive">{error}</p>

  return (
    <div className="flex flex-col gap-2">
      {realtimeStatus === "offline" && (
        <p className="text-xs text-muted-foreground">
          ● mất kết nối tức thời — đang làm mới định kỳ
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CARDS.map((c) => (
          <Card key={c.key} size="sm" className="gap-1 p-3">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            {loading ? (
              <Skeleton className="h-7 w-10" />
            ) : (
              <span
                className={
                  c.tone === "danger" && (data?.[c.key] ?? 0) > 0
                    ? "text-2xl font-semibold text-destructive"
                    : "text-2xl font-semibold"
                }
              >
                {data?.[c.key] ?? 0}
              </span>
            )}
          </Card>
        ))}
      </div>
      {data && (
        <p className="text-xs text-muted-foreground">
          {data.mode === "manager"
            ? `Trên ${data.project_ids.length} dự án bạn quản lý`
            : "Chỉ các hạng mục được giao cho bạn"}
        </p>
      )}
    </div>
  )
}
