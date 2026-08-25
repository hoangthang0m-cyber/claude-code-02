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
  type FirestoreError,
} from "firebase/firestore"
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage"

import { db, storage } from "@/firebase/config"
import type { Attachment, ContentItem } from "@/modules/campaigns/types/campaign.types"

function collectionRef(campaignId: string) {
  return collection(db, "campaigns", campaignId, "contentItems")
}

function toContentItem(id: string, data: Record<string, unknown>): ContentItem {
  return { id, ...data } as ContentItem
}

export function subscribeToContentItems(
  campaignId: string,
  onChange: (items: ContentItem[]) => void,
  onError?: (error: FirestoreError) => void
) {
  const q = query(collectionRef(campaignId), orderBy("createdAt", "asc"))
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((docSnap) => toContentItem(docSnap.id, docSnap.data())))
    },
    onError
  )
}

export function createContentItem(campaignId: string, createdBy: string) {
  return addDoc(collectionRef(campaignId), {
    campaignId,
    scriptTitle: "",
    status: "draft",
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function importContentItem(
  campaignId: string,
  createdBy: string,
  data: Partial<Omit<ContentItem, "id" | "campaignId" | "createdAt" | "createdBy" | "updatedAt">>
) {
  return addDoc(collectionRef(campaignId), {
    scriptTitle: "",
    status: "draft",
    ...data,
    campaignId,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function updateContentItem(
  campaignId: string,
  contentItemId: string,
  data: Partial<Omit<ContentItem, "id" | "campaignId" | "createdAt" | "createdBy">>
) {
  return updateDoc(doc(db, "campaigns", campaignId, "contentItems", contentItemId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export function deleteContentItem(campaignId: string, contentItemId: string) {
  return deleteDoc(doc(db, "campaigns", campaignId, "contentItems", contentItemId))
}

export async function uploadContentFile(
  campaignId: string,
  contentItemId: string,
  file: File,
  uploadedBy: string
): Promise<Attachment> {
  const attachmentId = crypto.randomUUID()
  const storageRef = ref(
    storage,
    `campaigns/${campaignId}/contentItems/${contentItemId}/${attachmentId}-${file.name}`
  )
  await uploadBytes(storageRef, file)
  const fileUrl = await getDownloadURL(storageRef)

  return {
    id: attachmentId,
    fileName: file.name,
    fileUrl,
    fileType: file.type,
    fileSizeBytes: file.size,
    uploadedBy,
    uploadedAt: Timestamp.now(),
  }
}

export async function deleteContentFileFromStorage(
  campaignId: string,
  contentItemId: string,
  attachment: Pick<Attachment, "id" | "fileName">
) {
  const storageRef = ref(
    storage,
    `campaigns/${campaignId}/contentItems/${contentItemId}/${attachment.id}-${attachment.fileName}`
  )
  await deleteObject(storageRef).catch(() => undefined)
}
