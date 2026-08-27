import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

// Server-side Firebase Admin SDK. All mutations for projects / content /
// workflow go through Next route handlers that use this (SPEC muc 2, 5.3:
// enforcement must be server-side, not just hidden in the UI). Client code
// keeps reading via the Firebase Web SDK (onSnapshot) for realtime.
//
// Initialization is lazy: importing this module never touches credentials, so
// the build and client bundles are unaffected. It throws only when a handler
// actually calls it without configured credentials.

let cached: { app: App; db: Firestore; auth: Auth } | null = null

function readCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n")

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY."
    )
  }

  return { projectId, clientEmail, privateKey }
}

function getAdmin() {
  if (cached) return cached

  const { projectId, clientEmail, privateKey } = readCredentials()
  const app =
    getApps()[0] ??
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })

  cached = { app, db: getFirestore(app), auth: getAuth(app) }
  return cached
}

export function getAdminDb(): Firestore {
  return getAdmin().db
}

export function getAdminAuth(): Auth {
  return getAdmin().auth
}
