import type { AdsMetricView } from "@/lib/domain"
import { Badge } from "@/components/ui/badge"

// SPEC §5.4 R3 (task 5.10): the "báo cáo hiệu quả ads" cell — the current
// figure, the "số liệu tính đến" moment, and whether it is synced or hand-typed.

const DELIVERY_LABEL: Record<string, string> = {
  active: "Đang chạy",
  paused: "Tạm dừng",
  completed: "Hoàn tất",
  unknown: "—",
}

const vnd = new Intl.NumberFormat("vi-VN")
const money = (n: number) => `${vnd.format(Math.round(n))}₫`

export function AdsReportCell({ metric }: { metric?: AdsMetricView | null }) {
  if (!metric) {
    return <span className="text-xs text-muted-foreground">Chưa có dữ liệu</span>
  }

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="font-medium text-foreground">
        ROAS {metric.roas.toFixed(2)} · CPP {money(metric.cost_per_purchase)}
      </span>
      <span className="text-muted-foreground">
        {vnd.format(metric.messages)} tin nhắn · CTR {metric.ctr.toFixed(2)}%
      </span>
      <span className="text-muted-foreground">Chi phí {money(metric.spend)}</span>
      <span className="flex flex-wrap items-center gap-1.5 pt-0.5 text-muted-foreground">
        {metric.delivery_status !== "unknown" && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            {DELIVERY_LABEL[metric.delivery_status]}
          </Badge>
        )}
        <span>
          {metric.source === "manual" ? "Nhập tay" : "Tự động"}
          {metric.data_as_of
            ? ` · đến ${new Date(metric.data_as_of).toLocaleDateString("vi-VN")}`
            : ""}
        </span>
      </span>
    </div>
  )
}
