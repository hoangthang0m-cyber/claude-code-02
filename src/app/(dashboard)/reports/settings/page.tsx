"use client"

import Link from "next/link"

import { useAuth } from "@/context/AuthContext"
import { ProductConfigView } from "@/modules/ads-overview/components/ProductConfigView"

// task 5.6: the product-config screen — products, account → product mapping,
// manual campaign pins, reporting currency + FX rates. Manager only (the APIs
// enforce it too).
export default function ReportSettingsPage() {
  const { profile } = useAuth()
  const isManager = profile?.system_role === "manager"

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <div className="flex items-center gap-2">
        <Link href="/reports" className="text-sm text-muted-foreground hover:underline">
          ← Báo cáo
        </Link>
        <h1 className="text-lg font-semibold">Cấu hình báo cáo</h1>
      </div>
      {isManager ? (
        <ProductConfigView />
      ) : (
        <p className="text-sm text-destructive">
          Chỉ Trưởng phòng được mở trang này.
        </p>
      )}
    </div>
  )
}
