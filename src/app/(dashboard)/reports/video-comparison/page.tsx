"use client"

import * as React from "react"
import Link from "next/link"

import { VideoComparisonView } from "@/modules/ads-overview/components/VideoComparisonView"

// ads-overview-reporting nhóm 6: bảng so sánh video, mở từ "Xem hiệu quả" ở
// trang Dự án. Trước chỉ Trưởng phòng; từ 2026-09-28 mọi thành viên đăng nhập
// đều xem được (API cũng đã mở qua requireReportingViewer).
export default function VideoComparisonPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <div className="flex items-center gap-2">
        <Link href="/reports" className="text-sm text-muted-foreground hover:underline">
          ← Báo cáo
        </Link>
        <h1 className="text-lg font-semibold">So sánh video</h1>
      </div>
      <React.Suspense
        fallback={<p className="text-sm text-muted-foreground">Đang tải…</p>}
      >
        <VideoComparisonView />
      </React.Suspense>
    </div>
  )
}
