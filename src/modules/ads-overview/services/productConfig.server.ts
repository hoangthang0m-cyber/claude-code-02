import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  REPORTING_SETTINGS_DOC_ID,
  accountRulesSetSchema,
  campaignProductOverrideId,
  campaignProductOverrideSetSchema,
  currencyRateId,
  currencyRateWriteSchema,
  productAccountRuleId,
  productUpdateSchema,
  productWriteSchema,
  reportingSettingsWriteSchema,
  type ClassifyConfig,
  type CampaignProductOverrideView,
  type CurrencyRateView,
  type ProductAccountRuleView,
  type ProductView,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import { requireReportingManager } from "@/modules/ads-overview/services/reportingScope.server"

// ads-overview-reporting change, task 2.5. CRUD for the product model + the
// campaign → product rules. Manager only, server-enforced. A change here is
// picked up on the next report read with no re-sync (classification is pure).

type Db = ReturnType<typeof getAdminDb>

// ── shared: load the classification config (reused by the report APIs) ─────

export async function loadClassifyConfig(db: Db): Promise<ClassifyConfig> {
  const [products, rules, overrides] = await Promise.all([
    db.collection(COLLECTIONS.products).get(),
    db.collection(COLLECTIONS.productAccountRules).get(),
    db.collection(COLLECTIONS.campaignProductOverrides).get(),
  ])
  return {
    products: products.docs.map((d) => ({
      id: d.id,
      code: String(d.data().code ?? d.id),
      keywords: Array.isArray(d.data().keywords)
        ? (d.data().keywords as unknown[]).map(String)
        : [],
    })),
    rules: rules.docs.map((d) => ({
      ad_account_id: String(d.data().ad_account_id ?? ""),
      product_id: String(d.data().product_id ?? ""),
      is_account_default: d.data().is_account_default === true,
    })),
    overrides: overrides.docs.map((d) => ({
      ad_account_id: String(d.data().ad_account_id ?? ""),
      campaign_id: String(d.data().campaign_id ?? ""),
      product_id: String(d.data().product_id ?? ""),
    })),
  }
}

// ── read: the whole config for the cấu hình sản phẩm screen ───────────────

export interface ProductConfigView {
  products: ProductView[]
  rules: ProductAccountRuleView[]
  overrides: CampaignProductOverrideView[]
  /** connected ad accounts the manager can map (name + id) */
  accounts: Array<{ ad_account_id: string; name: string }>
  reporting_currency: string
  currency_rates: CurrencyRateView[]
}

export async function getProductConfig(
  actor: AuthedUser
): Promise<ProductConfigView> {
  requireReportingManager(actor)
  const db = getAdminDb()
  const [products, rules, overrides, connections, settings, rates] =
    await Promise.all([
      db.collection(COLLECTIONS.products).orderBy("code").get(),
      db.collection(COLLECTIONS.productAccountRules).get(),
      db.collection(COLLECTIONS.campaignProductOverrides).get(),
      db
        .collection(COLLECTIONS.adAccountConnections)
        .where("project_owner_id", "==", actor.uid)
        .get(),
      db
        .collection(COLLECTIONS.reportingSettings)
        .doc(REPORTING_SETTINGS_DOC_ID)
        .get(),
      db.collection(COLLECTIONS.currencyRates).get(),
    ])
  return {
    products: products.docs.map((d) => ({
      id: d.id,
      code: String(d.data().code ?? d.id),
      name: String(d.data().name ?? ""),
      keywords: Array.isArray(d.data().keywords)
        ? (d.data().keywords as unknown[]).map(String)
        : [],
    })),
    rules: rules.docs.map((d) => ({
      id: d.id,
      ad_account_id: String(d.data().ad_account_id ?? ""),
      product_id: String(d.data().product_id ?? ""),
      is_account_default: d.data().is_account_default === true,
    })),
    overrides: overrides.docs.map((d) => ({
      id: d.id,
      ad_account_id: String(d.data().ad_account_id ?? ""),
      campaign_id: String(d.data().campaign_id ?? ""),
      product_id: String(d.data().product_id ?? ""),
    })),
    accounts: connections.docs.map((d) => ({
      ad_account_id: String(d.data().ad_account_id ?? ""),
      name: String(d.data().name ?? ""),
    })),
    reporting_currency:
      typeof settings.data()?.reporting_currency === "string"
        ? String(settings.data()!.reporting_currency)
        : "VND",
    currency_rates: rates.docs
      .map((d) => ({
        id: d.id,
        from_currency: String(d.data().from_currency ?? ""),
        to_currency: String(d.data().to_currency ?? ""),
        rate: Number(d.data().rate ?? 0),
        effective_from: String(d.data().effective_from ?? ""),
      }))
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
  }
}

// ── reporting settings + currency rates (task 5.6) ───────────────────────

export async function updateReportingSettings(
  actor: AuthedUser,
  body: unknown
): Promise<{ reporting_currency: string }> {
  requireReportingManager(actor)
  const input = parseOrThrow(reportingSettingsWriteSchema, body)
  await getAdminDb()
    .collection(COLLECTIONS.reportingSettings)
    .doc(REPORTING_SETTINGS_DOC_ID)
    .set(
      {
        reporting_currency: input.reporting_currency,
        updated_at: FieldValue.serverTimestamp(),
        updated_by: actor.uid,
      },
      { merge: true }
    )
  return { reporting_currency: input.reporting_currency }
}

export async function addCurrencyRate(
  actor: AuthedUser,
  body: unknown
): Promise<{ id: string }> {
  requireReportingManager(actor)
  const input = parseOrThrow(currencyRateWriteSchema, body)
  if (input.from_currency === input.to_currency) {
    throw new HttpError(400, "Tỷ giá cần hai tiền tệ khác nhau")
  }
  const id = currencyRateId(
    input.from_currency,
    input.to_currency,
    input.effective_from
  )
  await getAdminDb()
    .collection(COLLECTIONS.currencyRates)
    .doc(id)
    .set({
      from_currency: input.from_currency,
      to_currency: input.to_currency,
      rate: input.rate,
      effective_from: input.effective_from,
      entered_by: actor.uid,
      created_at: FieldValue.serverTimestamp(),
    })
  return { id }
}

export async function deleteCurrencyRate(
  actor: AuthedUser,
  rateId: string
): Promise<{ id: string; removed: true }> {
  requireReportingManager(actor)
  await getAdminDb().collection(COLLECTIONS.currencyRates).doc(rateId).delete()
  return { id: rateId, removed: true }
}

// ── products ─────────────────────────────────────────────────────────────

async function assertProductExists(db: Db, productId: string) {
  const snap = await db.collection(COLLECTIONS.products).doc(productId).get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy sản phẩm")
  return snap
}

export async function createProduct(
  actor: AuthedUser,
  body: unknown
): Promise<{ id: string }> {
  requireReportingManager(actor)
  const input = parseOrThrow(productWriteSchema, body)
  const db = getAdminDb()
  const ref = db.collection(COLLECTIONS.products).doc(input.code)
  if ((await ref.get()).exists) {
    throw new HttpError(409, `Mã sản phẩm "${input.code}" đã tồn tại`)
  }
  await ref.set({
    code: input.code,
    name: input.name,
    keywords: input.keywords,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  })
  return { id: ref.id }
}

export async function updateProduct(
  actor: AuthedUser,
  productId: string,
  body: unknown
): Promise<{ id: string }> {
  requireReportingManager(actor)
  const input = parseOrThrow(productUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }
  const db = getAdminDb()
  await assertProductExists(db, productId)
  await db
    .collection(COLLECTIONS.products)
    .doc(productId)
    .update({ ...input, updated_at: FieldValue.serverTimestamp() })
  return { id: productId }
}

export async function deleteProduct(
  actor: AuthedUser,
  productId: string
): Promise<{ id: string; removed: true }> {
  requireReportingManager(actor)
  const db = getAdminDb()
  await assertProductExists(db, productId)

  // block while any rule / override still points at it — reassign first
  const [rules, overrides] = await Promise.all([
    db
      .collection(COLLECTIONS.productAccountRules)
      .where("product_id", "==", productId)
      .limit(1)
      .get(),
    db
      .collection(COLLECTIONS.campaignProductOverrides)
      .where("product_id", "==", productId)
      .limit(1)
      .get(),
  ])
  if (!rules.empty || !overrides.empty) {
    throw new HttpError(
      409,
      "Sản phẩm còn được gán cho tài khoản hoặc campaign — gỡ các gán đó trước"
    )
  }

  await db.collection(COLLECTIONS.products).doc(productId).delete()
  return { id: productId, removed: true }
}

// ── account → product rules ──────────────────────────────────────────────

// The account must be one the caller has connected (SPEC reuse of
// AdAccountConnection). Rules are stored by Ad Account ID so renaming the
// account on Meta does not matter (design.md "Quyết định đã chốt").
async function assertConnectedAccount(
  db: Db,
  actor: AuthedUser,
  adAccountId: string
): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.adAccountConnections)
    .where("project_owner_id", "==", actor.uid)
    .where("ad_account_id", "==", adAccountId)
    .limit(1)
    .get()
  if (snap.empty) {
    throw new HttpError(400, "Tài khoản quảng cáo chưa được kết nối")
  }
}

export async function setAccountRules(
  actor: AuthedUser,
  body: unknown
): Promise<{ ad_account_id: string; rules: number }> {
  requireReportingManager(actor)
  const input = parseOrThrow(accountRulesSetSchema, body)
  const db = getAdminDb()
  await assertConnectedAccount(db, actor, input.ad_account_id)

  const productIds = [...new Set(input.product_ids)]
  const products = await db.collection(COLLECTIONS.products).get()
  const known = new Set(products.docs.map((d) => d.id))
  for (const pid of productIds) {
    if (!known.has(pid)) throw new HttpError(400, `Sản phẩm "${pid}" không tồn tại`)
  }
  const defaultId = input.default_product_id ?? productIds[0]
  if (!productIds.includes(defaultId)) {
    throw new HttpError(400, "Sản phẩm mặc định phải nằm trong danh sách đã chọn")
  }

  // replace the account's whole rule set
  const existing = await db
    .collection(COLLECTIONS.productAccountRules)
    .where("ad_account_id", "==", input.ad_account_id)
    .get()
  const batch = db.batch()
  const keep = new Set(
    productIds.map((pid) => productAccountRuleId(input.ad_account_id, pid))
  )
  for (const d of existing.docs) {
    if (!keep.has(d.id)) batch.delete(d.ref)
  }
  for (const pid of productIds) {
    const ref = db
      .collection(COLLECTIONS.productAccountRules)
      .doc(productAccountRuleId(input.ad_account_id, pid))
    batch.set(ref, {
      ad_account_id: input.ad_account_id,
      product_id: pid,
      is_account_default: pid === defaultId,
      created_at: FieldValue.serverTimestamp(),
    })
  }
  await batch.commit()
  return { ad_account_id: input.ad_account_id, rules: productIds.length }
}

// ── manual campaign pin ─────────────────────────────────────────────────

export async function setCampaignOverride(
  actor: AuthedUser,
  body: unknown
): Promise<{ id: string; removed?: true }> {
  requireReportingManager(actor)
  const input = parseOrThrow(campaignProductOverrideSetSchema, body)
  const db = getAdminDb()
  const id = campaignProductOverrideId(input.ad_account_id, input.campaign_id)
  const ref = db.collection(COLLECTIONS.campaignProductOverrides).doc(id)

  if (input.product_id === null) {
    await ref.delete()
    return { id, removed: true }
  }

  await assertProductExists(db, input.product_id)
  await ref.set({
    ad_account_id: input.ad_account_id,
    campaign_id: input.campaign_id,
    product_id: input.product_id,
    set_by: actor.uid,
    set_at: FieldValue.serverTimestamp(),
  })
  return { id }
}
