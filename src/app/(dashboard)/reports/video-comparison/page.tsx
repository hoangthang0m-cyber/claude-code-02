"use client"

import * as React from "react"
import Link from "next/link"

import { useAuth } from "@/context/AuthContext"
import { VideoComparisonView } from "@/modules/ads-overview/components/VideoComparisonView"

// ads-overview-reporting group 6: the video-comparison table, opened from the
// "Xem hiệu quả" link on the Chiến dịch page. Manager only (the API enforces it).
export default function VideoComparisonPage() {
  const { profile } = useAuth()
  const isManager = profile?.system_role === "manager"

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <div className="flex items-center gap-2">
        <Link href="/reports" className="text-sm text-muted-foreground hover:underline">
          ← Báo cáo
        </Link>
        <h1 className="text-lg font-semibold">So sánh video</h1>
      </div>
      {isManager ? (
        <React.Suspense fallback={<p className="text-sm text-muted-foreground">Đang tải…</p>}>
          <VideoComparisonView />
        </React.Suspense>
      ) : (
        <p className="text-sm text-destructive">Chỉ Trưởng phòng được mở trang này.</p>
      )}
    </div>
  )
}
