"use client"

import { usePathname } from "next/navigation"

import { NotificationBell } from "@/modules/notifications/components/NotificationBell"
import { SidebarTrigger } from "@/components/ui/sidebar"

const PAGE_TITLES: Record<string, string> = {
  "/campaigns": "Dự án",
  "/calendar": "Lịch đội",
  "/documents": "Tài liệu",
  "/knowledge": "Tri thức",
  "/reports": "Báo cáo",
  "/ad-accounts": "Cài đặt",
}

// Câu dẫn nhỏ dưới tiêu đề — cho mỗi trang một "giọng" riêng.
const PAGE_KICKERS: Record<string, string> = {
  "/campaigns": "Không gian điều phối",
  "/calendar": "Nhịp của cả đội",
  "/documents": "Kho lưu trữ",
  "/knowledge": "Đúc kết & tri thức",
  "/reports": "Số liệu & hiệu quả",
  "/ad-accounts": "Cấu hình hệ thống",
}

export function SiteHeader() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? "Hẻm Tarot"
  const kicker = PAGE_KICKERS[pathname] ?? "Hẻm Tarot"

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-transparent bg-background/55 backdrop-blur-xl transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      {/* Chỉ sáng ở giữa — đường kẻ chân header không cắt ngang cứng nhắc */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklch,var(--primary),transparent_58%)_18%,color-mix(in_oklch,var(--gold),transparent_62%)_50%,color-mix(in_oklch,var(--primary),transparent_58%)_82%,transparent)]"
      />

      <div className="flex w-full items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />

        {/* Viên đá phân cách thay cho vạch dọc */}
        <span
          aria-hidden
          className="size-1.5 rotate-45 rounded-[1px] bg-gold shadow-[0_0_10px_1px_color-mix(in_oklch,var(--gold),transparent_45%)]"
          style={{ animation: "glow-pulse 4.5s ease-in-out infinite" }}
        />

        {/* Đổi trang → tiêu đề tự "hiện lên" nhờ key đổi theo pathname */}
        <div key={pathname} className="enter-veil min-w-0 leading-tight">
          <p className="label-rune truncate text-[0.625rem] tracking-[0.2em] opacity-80">
            {kicker}
          </p>
          <h1 className="truncate font-heading text-lg font-semibold tracking-[-0.015em]">
            {title}
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
