import type { Timestamp } from "firebase/firestore"

import type { CampaignPriority } from "@/constants/priority"
import type { CampaignStatus } from "@/constants/status"

export type { CampaignPriority, CampaignStatus }

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface Attachment {
  id: string
  fileName: string
  fileUrl: string
  fileSizeBytes: number
  uploadedBy: string
  uploadedAt: Timestamp
}

export interface Campaign {
  id: string
  title: string
  priority: CampaignPriority
  status: CampaignStatus
  assigneeId?: string
  dueDate?: Timestamp
  description?: string
  tags?: string[]
  checklist?: ChecklistItem[]
  dependsOnCampaignId?: string
  estimatedHours?: number
  actualHours?: number
  attachments?: Attachment[]
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface CampaignComment {
  id: string
  campaignId: string
  authorId: string
  content: string
  mentionedUserIds?: string[]
  createdAt: Timestamp
}

export interface CampaignFormValues {
  title: string
  priority: CampaignPriority
  status: CampaignStatus
  assigneeId: string
  dueDate: string
  description: string
  tags: string
}
