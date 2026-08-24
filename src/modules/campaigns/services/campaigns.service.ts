import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore"

import { db } from "@/firebase/config"
import type { CampaignCategorySlug } from "@/constants/campaignCategories"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"

const COLLECTION = "campaigns"

function toCampaign(id: string, data: Record<string, unknown>): Campaign {
  return { id, ...data } as Campaign
}

export function subscribeToCampaigns(
  categoryId: CampaignCategorySlug,
  onChange: (campaigns: Campaign[]) => void
) {
  const q = query(collection(db, COLLECTION), where("categoryId", "==", categoryId))
  return onSnapshot(q, (snapshot) => {
    const campaigns = snapshot.docs
      .map((docSnap) => toCampaign(docSnap.id, docSnap.data()))
      .sort((a, b) => b.month.localeCompare(a.month))
    onChange(campaigns)
  })
}

export function subscribeToAllCampaigns(onChange: (campaigns: Campaign[]) => void) {
  const q = query(collection(db, COLLECTION), orderBy("month", "desc"))
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((docSnap) => toCampaign(docSnap.id, docSnap.data())))
  })
}

export function subscribeToCampaign(campaignId: string, onChange: (campaign: Campaign | null) => void) {
  return onSnapshot(doc(db, COLLECTION, campaignId), (snapshot) => {
    onChange(snapshot.exists() ? toCampaign(snapshot.id, snapshot.data()) : null)
  })
}

export function createCampaign(data: {
  categoryId: CampaignCategorySlug
  title: string
  month: string
  createdBy: string
}) {
  return addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  })
}

export function deleteCampaign(campaignId: string) {
  return deleteDoc(doc(db, COLLECTION, campaignId))
}
