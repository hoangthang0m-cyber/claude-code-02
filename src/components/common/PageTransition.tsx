"use client"

import { usePathname } from "next/navigation"

/**
 * Chuyển trang: mỗi lần `pathname` đổi, `key` đổi theo nên React dựng lại nút
 * này và animation `enter-rise` chạy lại — nội dung trôi lên, tan sương và rõ
 * dần. Thuần trình bày, không can thiệp vào điều hướng.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div key={pathname} className="enter-rise flex flex-1 flex-col">
      {children}
    </div>
  )
}
