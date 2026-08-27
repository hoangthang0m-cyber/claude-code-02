export const CONTENT_STATUSES = [
  "draft",
  "recording",
  "pending_review",
  "ready_to_post",
  "posted_ads",
  "paused",
  "cancelled",
] as const

export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Chưa bắt đầu",
  recording: "Đang thực hiện",
  pending_review: "Chờ duyệt",
  ready_to_post: "Đã duyệt",
  posted_ads: "Hoàn thành / Đã lên ads",
  paused: "Tạm dừng",
  cancelled: "Huỷ",
}

export const CONTENT_STATUS_BADGE_VARIANT: Record<
  ContentStatus,
  "outline" | "secondary" | "default" | "destructive"
> = {
  draft: "outline",
  recording: "secondary",
  pending_review: "secondary",
  ready_to_post: "default",
  posted_ads: "default",
  paused: "outline",
  cancelled: "destructive",
}

export const CONTENT_STATUS_ACCENT: Record<ContentStatus, string> = {
  draft: "var(--muted-foreground)",
  recording: "var(--secondary-foreground)",
  pending_review: "var(--chart-4, var(--primary))",
  ready_to_post: "var(--primary)",
  posted_ads: "var(--chart-2, var(--primary))",
  paused: "var(--muted-foreground)",
  cancelled: "var(--destructive)",
}

const STATUSES_EXEMPT_FROM_OVERDUE = new Set<ContentStatus>(["posted_ads", "paused", "cancelled"])

export function isContentStatusExemptFromOverdue(status: ContentStatus): boolean {
  return STATUSES_EXEMPT_FROM_OVERDUE.has(status)
}
