"use client"

import * as React from "react"

import type { CampaignPriority } from "@/constants/priority"
import type { CampaignStatus } from "@/constants/status"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"

export type CampaignSortBy = "createdAt" | "dueDate" | "priority"

export interface CampaignFiltersState {
  search: string
  status: CampaignStatus | "all"
  priority: CampaignPriority | "all"
  assigneeId: string | "all"
  sortBy: CampaignSortBy
}

const DEFAULT_FILTERS: CampaignFiltersState = {
  search: "",
  status: "all",
  priority: "all",
  assigneeId: "all",
  sortBy: "createdAt",
}

const PRIORITY_WEIGHT: Record<CampaignPriority, number> = { low: 0, medium: 1, high: 2 }

export function useCampaignFilters(campaigns: Campaign[]) {
  const [filters, setFilters] = React.useState<CampaignFiltersState>(DEFAULT_FILTERS)

  const assigneeOptions = React.useMemo(() => {
    const ids = new Set<string>()
    campaigns.forEach((campaign) => {
      if (campaign.assigneeId) ids.add(campaign.assigneeId)
    })
    return Array.from(ids)
  }, [campaigns])

  const filtered = React.useMemo(() => {
    const search = filters.search.trim().toLowerCase()

    const result = campaigns.filter((campaign) => {
      const matchesSearch =
        !search ||
        campaign.title.toLowerCase().includes(search) ||
        (campaign.description ?? "").toLowerCase().includes(search) ||
        (campaign.assigneeId ?? "").toLowerCase().includes(search)
      const matchesStatus = filters.status === "all" || campaign.status === filters.status
      const matchesPriority = filters.priority === "all" || campaign.priority === filters.priority
      const matchesAssignee =
        filters.assigneeId === "all" || campaign.assigneeId === filters.assigneeId
      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee
    })

    return [...result].sort((a, b) => {
      if (filters.sortBy === "dueDate") {
        const aTime = a.dueDate?.toMillis() ?? Number.POSITIVE_INFINITY
        const bTime = b.dueDate?.toMillis() ?? Number.POSITIVE_INFINITY
        return aTime - bTime
      }
      if (filters.sortBy === "priority") {
        return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      }
      const aTime = a.createdAt?.toMillis() ?? 0
      const bTime = b.createdAt?.toMillis() ?? 0
      return bTime - aTime
    })
  }, [campaigns, filters])

  return { filters, setFilters, filtered, assigneeOptions }
}
