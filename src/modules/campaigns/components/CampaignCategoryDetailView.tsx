"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CampaignCategory } from "@/constants/campaignCategories"
import { CampaignMonthList } from "@/modules/campaigns/components/CampaignMonthList"
import { ContentKanbanBoard } from "@/modules/campaigns/components/ContentKanbanBoard"
import { NewCampaignSheet } from "@/modules/campaigns/components/NewCampaignSheet"
import { QuickAddContentSheet } from "@/modules/campaigns/components/QuickAddContentSheet"
import { useCategoryContentItems } from "@/modules/campaigns/hooks/useCategoryContentItems"

export function CampaignCategoryDetailView({ category }: { category: CampaignCategory }) {
  const { items, campaigns, loading, error } = useCategoryContentItems(category.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{category.name}</h1>
        <div className="flex items-center gap-2">
          <QuickAddContentSheet campaigns={campaigns} />
          <NewCampaignSheet categoryId={category.id} />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Lỗi tải dữ liệu: {error}</p>
      ) : (
        <Tabs defaultValue="kanban">
          <TabsList>
            <TabsTrigger value="kanban">Bảng Kanban</TabsTrigger>
            <TabsTrigger value="months">Theo tháng</TabsTrigger>
          </TabsList>
          <TabsContent value="kanban" className="pt-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Đang tải...</p>
            ) : (
              <ContentKanbanBoard items={items} campaigns={campaigns} />
            )}
          </TabsContent>
          <TabsContent value="months" className="pt-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Đang tải...</p>
            ) : (
              <CampaignMonthList campaigns={campaigns} categorySlug={category.slug} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
