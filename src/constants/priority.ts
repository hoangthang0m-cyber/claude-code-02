export const CAMPAIGN_PRIORITIES = ["low", "medium", "high"] as const

export type CampaignPriority = (typeof CAMPAIGN_PRIORITIES)[number]

export const CAMPAIGN_PRIORITY_LABELS: Record<CampaignPriority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
}
