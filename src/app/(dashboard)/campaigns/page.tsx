import { CampaignOverviewView } from "@/modules/campaigns/components/CampaignOverviewView"

export default function CampaignsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <h1 className="text-lg font-semibold">Chiến dịch</h1>
      <CampaignOverviewView />
    </div>
  )
}
