import type { Timestamp } from "firebase/firestore"

import type { CampaignCategorySlug } from "@/constants/campaignCategories"
import type { ContentStatus } from "@/constants/contentStatus"
import type { OnDeadlineStatus } from "@/constants/onDeadlineStatus"

export type { CampaignCategorySlug, ContentStatus, OnDeadlineStatus }
export type { CampaignCategory } from "@/constants/campaignCategories"

export interface Attachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSizeBytes: number
  uploadedBy: string
  uploadedAt: Timestamp
}

export interface Campaign {
  id: string
  categoryId: CampaignCategorySlug
  title: string
  month: string
  createdBy: string
  createdAt: Timestamp
}

export interface ContentItem {
  id: string
  campaignId: string
  deadline?: Timestamp
  assigneeId?: string
  scriptTitle: string
  scriptGroupLabel?: string
  videoFile?: Attachment
  status: ContentStatus
  topic?: string
  onDeadlineStatus?: OnDeadlineStatus
  adsPerformanceReport?: string
  evaluationNote?: string
  productFiles?: Attachment[]
  reportDate?: Timestamp
  adSpend?: number
  revenue?: number
  purchases?: number
  cpp?: number
  roas?: number
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface CampaignFormValues {
  title: string
  month: string
}
