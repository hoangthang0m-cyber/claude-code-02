export const PRIORITY_LEVELS = ["low", "medium", "high", "urgent"] as const

export type PriorityLevel = (typeof PRIORITY_LEVELS)[number]

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn",
}

export const PRIORITY_BADGE_VARIANT: Record<
  PriorityLevel,
  "outline" | "secondary" | "default" | "destructive"
> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
}
