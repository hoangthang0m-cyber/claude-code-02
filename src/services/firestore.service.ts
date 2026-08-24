import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type QueryConstraint,
  type WithFieldValue,
} from "firebase/firestore"

import { db } from "@/firebase/config"

export function subscribeToCollection<T>(
  collectionName: string,
  onChange: (items: (T & { id: string })[]) => void,
  constraints: QueryConstraint[] = [],
  onError?: (error: FirestoreError) => void
) {
  const q = query(collection(db, collectionName), ...constraints)
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(
        (docSnap) => ({ id: docSnap.id, ...(docSnap.data() as T) }) as T & { id: string }
      )
      onChange(items)
    },
    onError
  )
}

export function createDocument<T extends WithFieldValue<DocumentData>>(
  collectionName: string,
  data: T
) {
  return addDoc(collection(db, collectionName), data)
}

export function updateDocument(
  collectionName: string,
  id: string,
  data: Partial<DocumentData>
) {
  return updateDoc(doc(db, collectionName, id), data)
}

export function deleteDocument(collectionName: string, id: string) {
  return deleteDoc(doc(db, collectionName, id))
}
