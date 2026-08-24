export const CONTENT_STATUSES = ["draft", "recording", "ready_to_post", "posted_ads"] as const

export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Chưa làm",
  recording: "Đang quay/dựng",
  ready_to_post: "Sẵn sàng đăng",
  posted_ads: "Đã lên ads",
}

export const CONTENT_STATUS_BADGE_VARIANT: Record<
  ContentStatus,
  "outline" | "secondary" | "default" | "destructive"
> = {
  draft: "outline",
  recording: "secondary",
  ready_to_post: "default",
  posted_ads: "destructive",
}
