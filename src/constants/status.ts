export const CAMPAIGN_STATUSES = ["todo", "in_progress", "done"] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  done: "Hoàn thành",
}
