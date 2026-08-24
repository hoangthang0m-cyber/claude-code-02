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
import type { Attachment, Campaign, CampaignComment } from "@/modules/campaigns/types/campaign.types"

const COLLECTION = "campaigns"
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

function toCampaign(id: string, data: Record<string, unknown>): Campaign {
  return { id, ...data } as Campaign
}

export function subscribeToCampaigns(onChange: (campaigns: Campaign[]) => void) {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"))
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((docSnap) => toCampaign(docSnap.id, docSnap.data())))
  })
}

export function subscribeToCampaign(campaignId: string, onChange: (campaign: Campaign | null) => void) {
  return onSnapshot(doc(db, COLLECTION, campaignId), (snapshot) => {
    onChange(snapshot.exists() ? toCampaign(snapshot.id, snapshot.data()) : null)
  })
}

export function createCampaign(
  data: Omit<Campaign, "id" | "createdAt" | "updatedAt" | "attachments" | "checklist">
) {
  return addDoc(collection(db, COLLECTION), {
    ...data,
    attachments: [],
    checklist: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function updateCampaign(campaignId: string, data: Partial<Omit<Campaign, "id" | "createdAt">>) {
  return updateDoc(doc(db, COLLECTION, campaignId), { ...data, updatedAt: serverTimestamp() })
}

export function deleteCampaign(campaignId: string) {
  return deleteDoc(doc(db, COLLECTION, campaignId))
}

// --- Comments (sub-collection) ---

function toComment(id: string, data: Record<string, unknown>): CampaignComment {
  return { id, ...data } as CampaignComment
}

export function subscribeToComments(
  campaignId: string,
  onChange: (comments: CampaignComment[]) => void
) {
  const q = query(
    collection(db, COLLECTION, campaignId, "comments"),
    orderBy("createdAt", "asc")
  )
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((docSnap) => toComment(docSnap.id, docSnap.data())))
  })
}

export function addComment(
  campaignId: string,
  data: { authorId: string; content: string; mentionedUserIds?: string[] }
) {
  return addDoc(collection(db, COLLECTION, campaignId, "comments"), {
    ...data,
    campaignId,
    createdAt: serverTimestamp(),
  })
}

// --- Attachments (Firebase Storage) ---

export async function uploadCampaignAttachment(
  campaignId: string,
  file: File,
  uploadedBy: string,
  currentAttachments: Attachment[]
): Promise<Attachment[]> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("File vượt quá giới hạn 10MB")
  }

  const attachmentId = crypto.randomUUID()
  const storageRef = ref(storage, `campaigns/${campaignId}/${attachmentId}-${file.name}`)
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
  await updateCampaign(campaignId, { attachments: nextAttachments })
  return nextAttachments
}

export async function deleteCampaignAttachment(
  campaignId: string,
  attachment: Attachment,
  currentAttachments: Attachment[]
): Promise<Attachment[]> {
  const storageRef = ref(storage, `campaigns/${campaignId}/${attachment.id}-${attachment.fileName}`)
  await deleteObject(storageRef).catch(() => undefined)

  const nextAttachments = currentAttachments.filter((item) => item.id !== attachment.id)
  await updateCampaign(campaignId, { attachments: nextAttachments })
  return nextAttachments
}
