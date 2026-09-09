import { AdAccountsPanel } from "@/modules/ads-performance/components/AdAccountsPanel"
import { NotificationPreferencesPanel } from "@/modules/notifications/components/NotificationPreferencesPanel"
import { Separator } from "@/components/ui/separator"

export default function AdAccountsPage() {
  return (
    <div className="flex flex-col gap-6 px-4 py-5 md:px-6 md:py-6">
      <AdAccountsPanel />
      <Separator className="max-w-2xl" />
      <NotificationPreferencesPanel />
    </div>
  )
}
