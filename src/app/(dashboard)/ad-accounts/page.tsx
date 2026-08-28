import { AdAccountsPanel } from "@/modules/ads-performance/components/AdAccountsPanel"
import { GoogleConnectPanel } from "@/modules/sheets-sync/components/GoogleConnectPanel"
import { Separator } from "@/components/ui/separator"

export default function AdAccountsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-6 px-4 py-4 duration-300 md:px-6 md:py-6">
      <AdAccountsPanel />
      <Separator className="max-w-2xl" />
      <GoogleConnectPanel />
    </div>
  )
}
