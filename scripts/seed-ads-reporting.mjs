// ads-overview-reporting change — seed for group 1 (task 1.1 / 1.5) and
// group 2 (task 2.4).
//
//   npm run seed:ads-reporting
//
// Idempotent:
//   - products/{a,t,h}          — the 3 fixed products (h carries keyword "hmdc")
//   - reportingSettings/default — reporting_currency = VND (only if absent)
//   - productAccountRules/*     — for every already-connected ad account whose
//     name matches design.md Decision 2 (AMHD* → product a; TBĐM / Ha Phuong →
//     products t + h, default t). Accounts not connected yet are listed and
//     left for the manager to map on the cấu hình sản phẩm screen.

import { FieldValue } from "firebase-admin/firestore"

import { initAdmin } from "./lib/admin.mjs"

const { db } = initAdmin()

const PRODUCTS = [
  { code: "a", name: "An Mệnh Hòa Duyên", keywords: [] },
  { code: "t", name: "Tứ Bản Định Mệnh", keywords: [] },
  { code: "h", name: "Hiếu Mệnh Dưỡng Con", keywords: ["hmdc"] },
]

const now = FieldValue.serverTimestamp()

// ── products ──────────────────────────────────────────────────────────────
for (const p of PRODUCTS) {
  const ref = db.collection("products").doc(p.code)
  const before = await ref.get()
  await ref.set(
    {
      code: p.code,
      name: p.name,
      keywords: p.keywords,
      updated_at: now,
      ...(before.exists ? {} : { created_at: now }),
    },
    { merge: true }
  )
  console.log(`✓ products/${p.code} — ${p.name}`)
}

// ── reportingSettings/default ─────────────────────────────────────────────
const settingsRef = db.collection("reportingSettings").doc("default")
const settingsSnap = await settingsRef.get()
if (settingsSnap.exists) {
  console.log(
    `• reportingSettings/default already set (reporting_currency = ${
      settingsSnap.data().reporting_currency
    })`
  )
} else {
  await settingsRef.set({
    reporting_currency: "VND",
    updated_at: now,
    updated_by: "seed",
  })
  console.log("✓ reportingSettings/default — reporting_currency = VND")
}

// ── productAccountRules for connected accounts ────────────────────────────
function normalize(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim()
    .replace(/\s+/g, " ")
}

// name pattern → the rules to create for that account
function rulesForAccountName(name) {
  const n = normalize(name)
  if (n.includes("amhd")) {
    return [{ product_id: "a", is_account_default: true }]
  }
  if (n.includes("tbdm") || n.includes("ha phuong")) {
    return [
      { product_id: "t", is_account_default: true },
      { product_id: "h", is_account_default: false },
    ]
  }
  return null
}

const connSnap = await db.collection("adAccountConnections").get()
if (connSnap.empty) {
  console.log(
    "• No ad accounts connected yet — map them on the cấu hình sản phẩm screen " +
      "after connecting."
  )
}

for (const doc of connSnap.docs) {
  const data = doc.data()
  const adAccountId = String(data.ad_account_id ?? "")
  const name = String(data.name ?? "")
  const rules = rulesForAccountName(name)
  if (!rules) {
    console.log(
      `? ${name} (${adAccountId}) — no name match; map it manually in the UI`
    )
    continue
  }
  for (const r of rules) {
    const id = `${adAccountId}__${r.product_id}`
    await db
      .collection("productAccountRules")
      .doc(id)
      .set(
        {
          ad_account_id: adAccountId,
          product_id: r.product_id,
          is_account_default: r.is_account_default,
          created_at: now,
        },
        { merge: true }
      )
  }
  console.log(
    `✓ ${name} (${adAccountId}) → ${rules
      .map((r) => r.product_id + (r.is_account_default ? "*" : ""))
      .join(", ")}`
  )
}

console.log("\nDone.")
process.exit(0)
