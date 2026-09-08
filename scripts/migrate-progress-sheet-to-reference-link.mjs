// campaign-page-reference-links task 2.2 — one-time migration.
//
//   npm run migrate:progress-links          # dry run
//   npm run migrate:progress-links -- --write
//
// For every project with a non-empty `progress_sheet_url`:
//   • create a referenceLinks doc (owner_type=project, label "Tiến độ dự án")
//   • remove the `progress_sheet_url` field from the project
// Idempotent: a project that already has a "Tiến độ dự án" reference link is
// only stripped of the dead field, not re-linked.

import { FieldValue } from "firebase-admin/firestore"

import { initAdmin } from "./lib/admin.mjs"

const LABEL = "Tiến độ dự án"
const STEP = 100
const write = process.argv.includes("--write")

const { db } = initAdmin()

const projects = await db.collection("projects").get()
let created = 0
let stripped = 0
let skipped = 0

for (const doc of projects.docs) {
  const data = doc.data()
  const url = typeof data.progress_sheet_url === "string" ? data.progress_sheet_url.trim() : ""
  if (!url) continue

  // already has the link?
  const existing = await db
    .collection("referenceLinks")
    .where("owner_type", "==", "project")
    .where("owner_id", "==", doc.id)
    .where("label", "==", LABEL)
    .limit(1)
    .get()

  const needsLink = existing.empty
  console.log(
    `  ${doc.id}  ${needsLink ? "→ tạo link" : "(đã có link)"}  + bỏ cột progress_sheet_url   ${url}`
  )
  if (!needsLink) skipped++

  if (!write) continue

  if (needsLink) {
    await db.collection("referenceLinks").add({
      owner_type: "project",
      owner_id: doc.id,
      url,
      label: LABEL,
      note: null,
      created_by: typeof data.created_by === "string" ? data.created_by : "migration",
      created_at: FieldValue.serverTimestamp(),
      sort_index: STEP,
    })
    created++
  }
  await doc.ref.update({ progress_sheet_url: FieldValue.delete() })
  stripped++
}

if (!write) {
  console.log("\nDry run — chạy lại với -- --write để áp dụng.")
  process.exit(0)
}
console.log(`\n✓ tạo ${created} link, bỏ cột trên ${stripped} dự án (bỏ qua ${skipped} link đã có).`)
process.exit(0)
