import { randomBytes } from "node:crypto"

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { MetaGraphError } from "@/lib/server/meta/errors"

// SPEC §5.4 / §6.4, task 9.4: an integration walk of the Meta Ads sync across
// several cron runs — periodic cadence, multiple ads per item + multiple items,
// a rate-limit blip that retries then recovers, a delivery stop that notifies,
// and a dead token that disables the account — with adsMetrics / bindings /
// connection state persisting between runs. Each piece has its own unit tests
// (adsSync.server.test.ts, metricsAggregate.test.ts, errors.test.ts); this
// proves the sequence.

const { fx, meta } = vi.hoisted(() => ({
  fx: {
    now: 0,
    bindings: [] as Array<{ id: string; data: Record<string, unknown>; ref: { update: (p: Record<string, unknown>) => Promise<void> } }>,
    items: new Map<string, Record<string, unknown>>(),
    lifecycle: "running" as string,
    metrics: [] as Array<Record<string, unknown>>,
    conn: { state: "connected" } as { state: string },
    notifications: [] as Record<string, unknown>[],
    managers: ["u-mgr"] as string[],
  },
  meta: {
    // per (objectId) → a queue of "ok" | Error, consumed on each fetch
    script: {} as Record<string, Array<"ok" | Error>>,
    status: {} as Record<string, string>,
    insights: { spend: 100, messages: 5, purchases: 2, cost_per_purchase: 50, roas: 3, ctr: 1, ads_started_on: "2026-08-01" },
  },
}))

vi.mock("@/lib/server/meta/insights", () => ({
  fetchAdObjectInsights: vi.fn(async (objectId: string) => {
    const q = meta.script[objectId] ?? []
    const step = q.length ? q.shift()! : "ok"
    if (step !== "ok") throw step
    return { ...meta.insights, object_id: objectId }
  }),
  fetchDeliveryStatus: vi.fn(async (objectId: string) => meta.status[objectId] ?? "active"),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, [...clauses, `${f}=${JSON.stringify(v)}`]),
    limit: () => query(name, clauses),
    get: async () => {
      if (name === "adsBindings") {
        return {
          docs: fx.bindings.map((b) => ({ id: b.id, data: () => b.data, ref: b.ref })),
        }
      }
      if (name === "adsMetrics") {
        const ci = clauses
          .find((c) => c.startsWith("content_item_id="))
          ?.slice("content_item_id=".length)
        const want = ci ? JSON.parse(ci) : null
        return {
          docs: fx.metrics
            .filter((m) => want == null || m.content_item_id === want)
            .map((m, i) => ({ id: `m${i}`, data: () => m })),
        }
      }
      if (name === "projectMembers") {
        return { docs: fx.managers.map((u) => ({ data: () => ({ user_id: u }) })) }
      }
      if (name === "adAccountConnections") {
        return {
          empty: false,
          docs: [
            {
              data: () => ({ state: fx.conn.state, token_encrypted: encryptSecret("real-token") }),
              ref: {
                update: async (p: Record<string, unknown>) => {
                  Object.assign(fx.conn, p)
                },
              },
            },
          ],
        }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      batch: () => ({
        set: (_ref: unknown, data: Record<string, unknown>) => {
          if (data?.source === "synced") {
            const at = fx.now // snapshot — server timestamp ≈ now at write time
            fx.metrics.push({ ...data, captured_at: { toMillis: () => at } })
          } else if (data?.type) {
            fx.notifications.push(data)
          }
        },
        commit: async () => {},
      }),
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => ({
          id: id ?? "new",
          get: async () => {
            if (name === "contentItems") {
              const d = fx.items.get(id ?? "")
              return { exists: d != null, data: () => d }
            }
            if (name === "projects") {
              return { exists: true, data: () => ({ lifecycle: fx.lifecycle }) }
            }
            return { exists: false }
          },
        }),
      }),
    }),
  }
})

import { encryptSecret } from "@/lib/server/crypto"
import { syncDueAdsMetrics } from "@/modules/ads-performance/services/adsSync.server"

const T0 = 1_800_000_000_000 // a realistic epoch — captured_at is never 0
const HOUR = 3_600_000
const OPTS = { retryBaseMs: 0 }
const rateLimit = () => new MetaGraphError("rate_limit", "slow down", 4)

function binding(id: string, contentItemId: string, objectId: string) {
  const data: Record<string, unknown> = {
    content_item_id: contentItemId,
    ad_account_id: "acc-1",
    object_id: objectId,
    active: true,
  }
  return {
    id,
    data,
    ref: {
      update: async (p: Record<string, unknown>) => {
        Object.assign(data, p)
      },
    },
  }
}

const latestMetric = (ci: string) =>
  fx.metrics.filter((m) => m.content_item_id === ci).at(-1)

async function run(hoursFromStart: number) {
  const atMs = T0 + hoursFromStart * HOUR
  fx.now = atMs
  return syncDueAdsMetrics(atMs, OPTS)
}

beforeAll(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")
})

beforeEach(() => {
  fx.now = 0
  // item A: two ads (o1 + o2); item B: one ad (o3)
  fx.bindings = [
    binding("bA1", "A", "o1"),
    binding("bA2", "A", "o2"),
    binding("bB1", "B", "o3"),
  ]
  fx.items = new Map([
    ["A", { project_id: "p1", code: "A" }],
    ["B", { project_id: "p1", code: "B" }],
  ])
  fx.lifecycle = "running"
  fx.metrics = []
  fx.conn = { state: "connected" }
  fx.notifications = []
  fx.managers = ["u-mgr"]
  meta.script = {}
  meta.status = {}
})

describe("Meta Ads sync — integration (SPEC §5.4, task 9.4)", () => {
  it("cadence, multi-ad aggregation, rate-limit recovery, ads stopped, dead token", async () => {
    // ── run 1 (t+0): first sync, both items due ──────────────────────────
    const r1 = await run(0)
    expect(r1).toMatchObject({ items_scanned: 2, synced: 2 })
    // item A aggregates o1 + o2 (spend 100+100)
    expect(latestMetric("A")).toMatchObject({ spend: 200, source: "synced", delivery_status: "active" })
    expect(latestMetric("B")).toMatchObject({ spend: 100 })

    // ── run 2 (t+1h): inside the 6h interval → both skipped ────────────
    const r2 = await run(1)
    expect(r2).toMatchObject({ synced: 0, skipped_not_due: 2 })

    // ── run 3 (t+7h): due; o1 rate-limits x3 (retries) but o2 works ───
    meta.script.o1 = [rateLimit(), rateLimit(), rateLimit()]
    const r3 = await run(7)
    expect(r3.retries).toBe(2) // 2 backoffs before the 3rd attempt
    expect(r3.object_errors).toBe(1)
    expect(r3.synced).toBe(2) // A still written from o2 alone
    expect(latestMetric("A")).toMatchObject({ spend: 100 }) // only o2
    expect(fx.bindings.find((b) => b.id === "bA1")!.data.sync_error_since).toBeTruthy()

    // ── run 4 (t+13h): o1 recovers → full aggregation, error cleared ──
    const r4 = await run(13)
    expect(r4.object_errors).toBe(0)
    expect(latestMetric("A")).toMatchObject({ spend: 200 })
    expect(fx.bindings.find((b) => b.id === "bA1")!.data.sync_error_since).toBeNull()

    // ── run 5 (t+19h): item A's ads go paused → notify the managers ──
    meta.status.o1 = "paused"
    meta.status.o2 = "paused"
    const r5 = await run(19)
    expect(r5.ads_stopped_events).toBe(1)
    expect(latestMetric("A")).toMatchObject({ delivery_status: "paused" })
    expect(
      fx.notifications.some((n) => n.type === "ads_stopped" && n.recipient_id === "u-mgr")
    ).toBe(true)

    // ── run 6 (t+31h): the token dies → the whole account is disabled ─
    meta.script.o1 = [new MetaGraphError("auth", "token expired", 190)]
    const r6 = await run(31)
    expect(r6.accounts_disabled).toBe(1)
    expect(fx.conn.state).toBe("needs_reconnect")

    // ── run 7 (t+43h): account is broken → nothing syncs, no new metric
    const before = fx.metrics.length
    const r7 = await run(43)
    expect(r7.skipped_no_account).toBeGreaterThan(0)
    expect(fx.metrics.length).toBe(before)
  })
})
