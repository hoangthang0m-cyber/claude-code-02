import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore"
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage"

import { db, storage } from "@/firebase/config"
import type { Attachment, Task, TaskComment } from "@/modules/tasks/types/task.types"

const COLLECTION = "tasks"
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

function toTask(id: string, data: Record<string, unknown>): Task {
  return { id, ...data } as Task
}

export function subscribeToTasks(onChange: (tasks: Task[]) => void) {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"))
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((docSnap) => toTask(docSnap.id, docSnap.data())))
  })
}

export function subscribeToTask(taskId: string, onChange: (task: Task | null) => void) {
  return onSnapshot(doc(db, COLLECTION, taskId), (snapshot) => {
    onChange(snapshot.exists() ? toTask(snapshot.id, snapshot.data()) : null)
  })
}

export function createTask(
  data: Omit<Task, "id" | "createdAt" | "updatedAt" | "attachments" | "checklist">
) {
  return addDoc(collection(db, COLLECTION), {
    ...data,
    attachments: [],
    checklist: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function updateTask(taskId: string, data: Partial<Omit<Task, "id" | "createdAt">>) {
  return updateDoc(doc(db, COLLECTION, taskId), { ...data, updatedAt: serverTimestamp() })
}

export function deleteTask(taskId: string) {
  return deleteDoc(doc(db, COLLECTION, taskId))
}

// --- Comments (sub-collection) ---

function toComment(id: string, data: Record<string, unknown>): TaskComment {
  return { id, ...data } as TaskComment
}

export function subscribeToComments(
  taskId: string,
  onChange: (comments: TaskComment[]) => void
) {
  const q = query(
    collection(db, COLLECTION, taskId, "comments"),
    orderBy("createdAt", "asc")
  )
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((docSnap) => toComment(docSnap.id, docSnap.data())))
  })
}

export function addComment(
  taskId: string,
  data: { authorId: string; content: string; mentionedUserIds?: string[] }
) {
  return addDoc(collection(db, COLLECTION, taskId, "comments"), {
    ...data,
    taskId,
    createdAt: serverTimestamp(),
  })
}

// --- Attachments (Firebase Storage) ---

export async function uploadTaskAttachment(
  taskId: string,
  file: File,
  uploadedBy: string,
  currentAttachments: Attachment[]
): Promise<Attachment[]> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("File vượt quá giới hạn 10MB")
  }

  const attachmentId = crypto.randomUUID()
  const storageRef = ref(storage, `tasks/${taskId}/${attachmentId}-${file.name}`)
  await uploadBytes(storageRef, file)
  const fileUrl = await getDownloadURL(storageRef)

  const attachment: Attachment = {
    id: attachmentId,
    fileName: file.name,
    fileUrl,
    fileSizeBytes: file.size,
    uploadedBy,
    uploadedAt: Timestamp.now(),
  }

  const nextAttachments = [...currentAttachments, attachment]
  await updateTask(taskId, { attachments: nextAttachments })
  return nextAttachments
}

export async function deleteTaskAttachment(
  taskId: string,
  attachment: Attachment,
  currentAttachments: Attachment[]
): Promise<Attachment[]> {
  const storageRef = ref(storage, `tasks/${taskId}/${attachment.id}-${attachment.fileName}`)
  await deleteObject(storageRef).catch(() => undefined)

  const nextAttachments = currentAttachments.filter((item) => item.id !== attachment.id)
  await updateTask(taskId, { attachments: nextAttachments })
  return nextAttachments
}
