"use client"

import * as React from "react"

import { NewCampaignSheet } from "@/modules/campaigns/components/NewCampaignSheet"
import { CampaignCalendarView } from "@/modules/campaigns/components/CampaignCalendarView"
import { CampaignDetailDrawer } from "@/modules/campaigns/components/CampaignDetailDrawer"
import { CampaignFilterBar } from "@/modules/campaigns/components/CampaignFilterBar"
import { CampaignKanbanBoard } from "@/modules/campaigns/components/CampaignKanbanBoard"
import { CampaignList } from "@/modules/campaigns/components/CampaignList"
import { useCampaignFilters } from "@/modules/campaigns/hooks/useCampaignFilters"
import { useCampaigns } from "@/modules/campaigns/hooks/useCampaigns"
import { updateCampaign } from "@/modules/campaigns/services/campaigns.service"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function CampaignsView() {
  const { campaigns, loading } = useCampaigns()
  const { filters, setFilters, filtered, assigneeOptions } = useCampaignFilters(campaigns)
  const [view, setView] = React.useState("list")
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "Đang tải..." : `${filtered.length} / ${campaigns.length} chiến dịch`}
        </p>
        <NewCampaignSheet />
      </div>

      <CampaignFilterBar
        filters={filters}
        onChange={setFilters}
        assigneeOptions={assigneeOptions}
      />

      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <CampaignList campaigns={filtered} onSelectCampaign={setSelectedCampaignId} />
        </TabsContent>
        <TabsContent value="kanban">
          <CampaignKanbanBoard
            campaigns={filtered}
            onSelectCampaign={setSelectedCampaignId}
            onStatusChange={(campaignId, status) => updateCampaign(campaignId, { status })}
          />
        </TabsContent>
        <TabsContent value="calendar">
          <CampaignCalendarView campaigns={filtered} onSelectCampaign={setSelectedCampaignId} />
        </TabsContent>
      </Tabs>

      <CampaignDetailDrawer
        campaignId={selectedCampaignId}
        open={selectedCampaignId !== null}
        onOpenChange={(open) => !open && setSelectedCampaignId(null)}
      />
    </div>
  )
}
