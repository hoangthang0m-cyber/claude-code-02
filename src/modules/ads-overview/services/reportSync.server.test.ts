import { beforeEach, describe, expect, it, vi } from "vitest"

// ── in-memory Firestore fake ──────────────────────────────────────────────

type Doc = Record<string, unknown>
const store = new Map<string, Map<string, Doc>>()
const col = (n: string) => {
  if (!store.has(n)) store.set(n, new Map())
  return store.get(n)!
}

type Filter = [string, string, unknown]
const matches = (d: Doc, fs: Filter[]) =>
  fs.every(([f, op, v]) => (op === "==" ? d[f] === v : true))

function query(name: string, fs: Filter[], cap: number | null) {
  return {
    where: (f: string, o: string, v: unknown) =>
      query(name, [...fs, [f, o, v]], cap),
    limit: (n: number) => query(name, fs, n),
    get: async () => {
      let es = [...col(name).entries()].filter(([, d]) => matches(d, fs))
      if (cap != null) es = es.slice(0, cap)
      const docs = es.map(([id, d]) => ({ id, ref: docRef(name, id), data: () => d }))
      return { docs, empty: docs.length === 0, size: docs.length }
    },
  }
}

function docRef(name: string, id: string) {
  return {
    id,
    get name() {
      return name
    },
    get: async () => ({
      exists: col(name).has(id),
      id,
      data: () => col(name).get(id),
    }),
    set: async (data: Doc, opts?: { merge?: boolean }) =>
      void col(name).set(id, opts?.merge ? { ...(col(name).get(id) ?? {}), ...data } : data),
    update: async (data: Doc) =>
      void col(name).set(id, { ...(col(name).get(id) ?? {}), ...data }),
  }
}

const fakeDb = {
  collection: (name: string) => ({
    ...query(name, [], null),
    doc: (id: string) => docRef(name, id),
  }),
  batch: () => {
    const ops: Array<() => void> = []
    return {
      set: (ref: { name: string; id: string }, data: Doc) =>
        ops.push(() => col(ref.name).set(ref.id, data)),
      commit: async () => ops.forEach((f) => f()),
    }
  },
}

vi.mock("@/lib/server/firebaseAdmin", () => ({ getAdminDb: () => fakeDb }))
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (s: string) => `dec:${s}` }))
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__ts__" },
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}))

import {
  monthChunks,
  syncAdSnapshots,
  syncCampaignSnapshots,
} from "@/modules/ads-overview/services/reportSync.server"

// ── mock Meta ────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-06-15T09:00:00Z") // yesterday = 2026-06-14
const campaignCalls: Array<{ since: string; until: string }> = []
let mode: "ok" | "auth" | "rate" = "ok"
let campaignSpend = "1000"

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

// one campaign row for the first and last day of each chunk
const dayRow = (date: string) => ({
  campaign_id: "c1",
  campaign_name: "thắng - T(1/6)",
  objective: "OUTCOME_SALES",
  date_start: date,
  spend: campaignSpend,
  impressions: "5000",
  clicks: "80",
  actions: [{ action_type: "omni_purchase", value: "2" }],
  action_values: [{ action_type: "omni_purchase", value: "3000" }],
})

const defaultFetch = async (u: string) => {
  const url = new URL(u)
  if (url.pathname.endsWith("/insights") && url.searchParams.get("level") === "campaign") {
    if (mode === "auth") return jsonRes({ error: { code: 190, message: "token dead" } }, false, 400)
    if (mode === "rate") return jsonRes({ error: { code: 4, message: "slow down" } }, false, 429)
    const tr = JSON.parse(url.searchParams.get("time_range")!)
    campaignCalls.push(tr)
    const days = tr.since === tr.until ? [tr.since] : [tr.since, tr.until]
    return jsonRes({ data: days.map(dayRow) })
  }
  if (url.pathname.match(/\/act_\d+$/)) return jsonRes({ currency: "VND" })
  if (url.pathname.endsWith("/campaigns")) {
    return jsonRes({ data: [{ id: "c1", effective_status: "ACTIVE" }] })
  }
  return jsonRes({ data: [] })
}

const fetchImpl = vi.fn(defaultFetch)

beforeEach(() => {
  store.clear()
  campaignCalls.length = 0
  mode = "ok"
  campaignSpend = "1000"
  fetchImpl.mockReset()
  fetchImpl.mockImplementation(defaultFetch)
  col("adAccountConnections").set("m__555", {
    project_owner_id: "m",
    ad_account_id: "555",
    token_encrypted: "enc",
    state: "connected",
  })
})

const run = () =>
  syncCampaignSnapshots(NOW, { retryBaseMs: 0, fetchImpl: fetchImpl as never })

describe("monthChunks", () => {
  it("splits a 90-day range into calendar-month chunks", () => {
    const chunks = monthChunks("2026-03-20", "2026-06-14")
    expect(chunks).toEqual([
      { since: "2026-03-20", until: "2026-03-31" },
      { since: "2026-04-01", until: "2026-04-30" },
      { since: "2026-05-01", until: "2026-05-31" },
      { since: "2026-06-01", until: "2026-06-14" },
    ])
  })
})

describe("syncCampaignSnapshots (tasks 3.4 / 3.6 / 3.7)", () => {
  it("first run backfills 90 days ending yesterday, never today", async () => {
    const s = await run()
    expect(campaignCalls[0].since).toBe("2026-03-17") // 2026-06-14 minus 89
    expect(campaignCalls.at(-1)!.until).toBe("2026-06-14") // yesterday, not today
    const state = col("adAccountReportSyncStates").get("555__campaign")
    expect(state).toMatchObject({
      latest_synced_date: "2026-06-14",
      last_result: "ok",
    })
    expect(s.backfills).toBe(1)
    expect(s.snapshots_written).toBeGreaterThan(0)
  })

  it("upserts by deterministic id — a shared day is updated, not duplicated", async () => {
    await run()
    expect(col("adsInsightSnapshots").get("555__c1__2026-06-14")?.spend).toBe(1000)
    // second run is incremental over the last 7 days, which includes 06-14
    campaignSpend = "9999"
    await run()
    expect(col("adsInsightSnapshots").get("555__c1__2026-06-14")?.spend).toBe(9999)
    expect(
      [...col("adsInsightSnapshots").keys()].filter(
        (k) => k === "555__c1__2026-06-14"
      )
    ).toHaveLength(1)
  })

  it("incremental run re-syncs the last 7 days up to yesterday", async () => {
    col("adAccountReportSyncStates").set("555__campaign", {
      ad_account_id: "555",
      scope: "campaign",
      latest_synced_date: "2026-06-10",
      earliest_synced_date: "2026-03-01",
      last_full_sync_at: { toMillis: () => NOW - 2 * 86_400_000 },
      last_result: "ok",
    })
    await run()
    expect(campaignCalls[0].since).toBe("2026-06-03") // 2026-06-10 minus 7
  })

  it("an auth error marks the connection needs_reconnect and stops the account", async () => {
    mode = "auth"
    const s = await run()
    expect(s.accounts_disabled).toBe(1)
    expect(col("adAccountConnections").get("m__555")?.state).toBe("needs_reconnect")
    expect(col("adAccountReportSyncStates").get("555__campaign")?.last_result).toBe("error")
  })

  it("a rate-limit error keeps old snapshots and records a warning", async () => {
    mode = "rate"
    const s = await run()
    expect(s.accounts_warning).toBe(1)
    expect(s.retries).toBeGreaterThan(0)
    expect(col("adAccountReportSyncStates").get("555__campaign")?.last_result).toBe(
      "warning"
    )
  })

  it("skips an account already flagged needs_reconnect", async () => {
    col("adAccountConnections").set("m__555", {
      project_owner_id: "m",
      ad_account_id: "555",
      token_encrypted: "enc",
      state: "needs_reconnect",
    })
    const s = await run()
    expect(s.accounts_skipped_reconnect).toBe(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe("syncAdSnapshots (task 3.5)", () => {
  const runAd = () =>
    syncAdSnapshots(NOW, { retryBaseMs: 0, fetchImpl: fetchImpl as never })

  it("does nothing when there is no ad-level binding", async () => {
    // a campaign-level binding must NOT trigger an ad sync
    col("adsBindings").set("b1", {
      content_item_id: "ci1",
      ad_account_id: "555",
      object_level: "campaign",
      object_id: "c1",
      active: true,
    })
    const s = await runAd()
    expect(s.accounts_scanned).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("syncs only the ad ids that appear in an active ad-level binding", async () => {
    col("adsBindings").set("b1", {
      content_item_id: "ci1",
      ad_account_id: "555",
      object_level: "ad",
      object_id: "ad_9",
      active: true,
      created_at: { toMillis: () => NOW - 10 * 86_400_000 },
    })
    let adFilter: unknown
    fetchImpl.mockImplementation(async (u: string) => {
      const url = new URL(u)
      if (url.searchParams.get("level") === "ad") {
        adFilter = JSON.parse(url.searchParams.get("filtering")!)
        const tr = JSON.parse(url.searchParams.get("time_range")!)
        return jsonRes({
          data: [
            {
              ad_id: "ad_9",
              ad_name: "video 9",
              campaign_id: "c1",
              date_start: tr.since,
              spend: "100",
              video_play_actions: [{ value: "500" }],
              video_3_sec_watched_actions: [{ value: "300" }],
              video_p100_watched_actions: [{ value: "90" }],
            },
          ],
        })
      }
      if (url.pathname.match(/\/act_\d+$/)) return jsonRes({ currency: "VND" })
      return jsonRes({ data: [] })
    })

    const s = await runAd()
    expect(adFilter).toEqual([{ field: "ad.id", operator: "IN", value: ["ad_9"] }])
    expect(s.snapshots_written).toBeGreaterThan(0)
    const snap = [...col("adCreativeInsightSnapshots").values()][0]
    expect(snap).toMatchObject({ ad_id: "ad_9", video_3s_plays: 300, video_p100_plays: 90 })
  })
})
