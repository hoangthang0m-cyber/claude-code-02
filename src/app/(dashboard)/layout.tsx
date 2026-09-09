import { AppSidebar } from "@/components/common/AppSidebar"
import { AuthGuard } from "@/components/common/AuthGuard"
import { PageTransition } from "@/components/common/PageTransition"
import { SiteHeader } from "@/components/common/SiteHeader"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <AuthGuard>
      <SidebarProvider
        className="bg-transparent"
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 14)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        {/* Khung nội dung nổi trên nền khí quyển: kính mờ + viền sáng + bóng đổ */}
        <SidebarInset className="relative overflow-hidden rounded-2xl bg-background/45 ring-1 ring-border/70 backdrop-blur-xl md:peer-data-[variant=inset]:shadow-[0_1px_0_0_var(--sheen)_inset,0_18px_50px_-28px_var(--halo)]">
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <PageTransition>{children}</PageTransition>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  )
}
