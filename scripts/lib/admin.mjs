// Shared bootstrap for one-off admin scripts (docs/SPEC.md §6.9).
// Loads .env.local and returns an initialised Firebase Admin app.

import { readFileSync } from "node:fs"

import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

function loadEnvLocal() {
  let raw
  try {
    raw = readFileSync(".env.local", "utf8")
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/s.exec(line)
    if (!match) continue
    const [, key] = match
    let value = match[2]
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, "\n")
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export function initAdmin() {
  loadEnvLocal()

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n")

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "Missing FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / " +
        "FIREBASE_ADMIN_PRIVATE_KEY in .env.local (see docs/ENV.md)."
    )
    process.exit(1)
  }

  const app =
    getApps()[0] ??
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })

  return { app, auth: getAuth(app), db: getFirestore(app) }
}
