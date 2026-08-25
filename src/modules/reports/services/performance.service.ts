import { collectionGroup, onSnapshot, type FirestoreError } from "firebase/firestore"

import { db } from "@/firebase/config"
import type { ContentItem } from "@/modules/campaigns/types/campaign.types"

export function subscribeToAllContentItems(
  onChange: (items: ContentItem[]) => void,
  onError?: (error: FirestoreError) => void
) {
  const q = collectionGroup(db, "contentItems")
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as ContentItem))
    },
    onError
  )
}
