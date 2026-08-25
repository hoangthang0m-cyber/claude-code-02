import { type FirebaseApp, getApps, initializeApp } from "firebase/app"
import { type Auth, getAuth } from "firebase/auth"
import { type Firestore, getFirestore, initializeFirestore } from "firebase/firestore"
import { type FirebaseStorage, getStorage } from "firebase/storage"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

export const firebaseApp: FirebaseApp =
  getApps()[0] ?? initializeApp(firebaseConfig)

export const auth: Auth = getAuth(firebaseApp)

// Fields left as `undefined` (e.g. optional CSV columns that were blank) would
// otherwise make Firestore reject the whole write — ignore them instead of
// throwing. Falls back to the already-initialized instance across Fast Refresh.
export const db: Firestore = (() => {
  try {
    return initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true })
  } catch {
    return getFirestore(firebaseApp)
  }
})()

export const storage: FirebaseStorage = getStorage(firebaseApp)
