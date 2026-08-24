export const ON_DEADLINE_STATUSES = ["on_time", "late", "not_evaluated"] as const

export type OnDeadlineStatus = (typeof ON_DEADLINE_STATUSES)[number]

export const ON_DEADLINE_STATUS_LABELS: Record<OnDeadlineStatus, string> = {
  on_time: "Đúng hạn",
  late: "Trễ hạn",
  not_evaluated: "Chưa xác định",
}

export const ON_DEADLINE_STATUS_BADGE_VARIANT: Record<
  OnDeadlineStatus,
  "outline" | "secondary" | "destructive"
> = {
  on_time: "secondary",
  late: "destructive",
  not_evaluated: "outline",
}
