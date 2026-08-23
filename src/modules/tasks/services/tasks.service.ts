import { orderBy } from "firebase/firestore"

import {
  createDocument,
  deleteDocument,
  subscribeToCollection,
  updateDocument,
} from "@/services/firestore.service"
import type { Task, TaskStatus } from "@/types/task"

const COLLECTION = "tasks"

export function subscribeToTasks(onChange: (tasks: Task[]) => void) {
  return subscribeToCollection<Task>(COLLECTION, onChange, [orderBy("dueDate", "asc")])
}

export function createTask(data: Omit<Task, "id">) {
  return createDocument(COLLECTION, data)
}

export function updateTaskStatus(id: string, status: TaskStatus) {
  return updateDocument(COLLECTION, id, { status })
}

export function deleteTask(id: string) {
  return deleteDocument(COLLECTION, id)
}
