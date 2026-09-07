// project-grouping change task 1.3 — one-time backfill of `Project.sort_index`.
//
//   npm run backfill:sort-index          # dry run: prints what it would write
//   npm run backfill:sort-index -- --write
//
// Mirrors `computeSortIndexBackfill` in src/lib/domain/projectGroup.ts (that
// pure function is the unit-tested reference). Within each bucket — a `group_id`
// value, or the group_id-less bucket — projects that have no `sort_index` are
// appended after the bucket's current max, in `created_at` order (id breaks
// ties), gapped by 100. Idempotent: a project that already has `sort_index` is
// left untouched, so re-running only places newly un-indexed projects at the
// end of their bucket.

import { initAdmin } from "./lib/admin.mjs"

const STEP = 100
const write = process.argv.includes("--write")

const { db } = initAdmin()

const snap = await db.collection("projects").get()
if (snap.empty) {
  console.log("No projects.")
  process.exit(0)
}

const buckets = new Map()
for (const doc of snap.docs) {
  const d = doc.data()
  const key = d.group_id ?? null
  const b = buckets.get(key) ?? { indexed: [], pending: [] }
  if (typeof d.sort_index === "number") {
    b.indexed.push(d.sort_index)
  } else {
    const createdMs =
      typeof d.created_at?.toMillis === "function" ? d.created_at.toMillis() : 0
    b.pending.push({ id: doc.id, createdMs })
  }
  buckets.set(key, b)
}

const assignments = []
for (const [key, { indexed, pending }] of buckets) {
  const start = indexed.length ? Math.max(...indexed) : 0
  pending
    .sort((a, b) => a.createdMs - b.createdMs || (a.id < b.id ? -1 : 1))
    .forEach((p, i) => {
      assignments.push({ id: p.id, bucket: key ?? "(chưa phân nhóm)", sort_index: start + (i + 1) * STEP })
    })
}

if (assignments.length === 0) {
  console.log(`All ${snap.size} projects already have sort_index. Nothing to do.`)
  process.exit(0)
}

for (const a of assignments) {
  console.log(`  ${a.id}  [${a.bucket}]  → sort_index ${a.sort_index}`)
}

if (!write) {
  console.log(
    `\nDry run — ${assignments.length} of ${snap.size} projects would be updated. ` +
      `Re-run with -- --write to apply.`
  )
  process.exit(0)
}

let batch = db.batch()
let n = 0
for (const a of assignments) {
  batch.update(db.collection("projects").doc(a.id), { sort_index: a.sort_index })
  if (++n % 400 === 0) {
    await batch.commit()
    batch = db.batch()
  }
}
if (n % 400 !== 0) await batch.commit()

console.log(`\n✓ Wrote sort_index to ${assignments.length} projects.`)
