import type { Timestamp } from "firebase/firestore"

import type { TaskPriority } from "@/constants/priority"
import type { TaskStatus } from "@/constants/status"

export type { TaskPriority, TaskStatus }

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

export interface Task {
  id: string
  title: string
  priority: TaskPriority
  status: TaskStatus
  assigneeId?: string
  dueDate?: Timestamp
  description?: string
  tags?: string[]
  checklist?: ChecklistItem[]
  dependsOnTaskId?: string
  estimatedHours?: number
  actualHours?: number
  attachments?: Attachment[]
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface TaskComment {
  id: string
  taskId: string
  authorId: string
  content: string
  mentionedUserIds?: string[]
  createdAt: Timestamp
}

export interface TaskFormValues {
  title: string
  priority: TaskPriority
  status: TaskStatus
  assigneeId: string
  dueDate: string
  description: string
  tags: string
}
