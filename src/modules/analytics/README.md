# analytics

SPEC `docs/SPEC.md` §5.6 · checklist group 7.8.

The manager's progress dashboard, the per-person workload view, weekly/monthly
reports with period comparison, and CSV/Excel export.

## Live progress dashboard (task 8.1)

`GET /api/dashboard` → the six counters (SPEC §5.6 R1):

| counter | meaning |
|---|---|
| `total` | every content item in scope |
| `in_production` | still in the pipeline — status ∉ {chờ duyệt, đã lên ads} |
| `pending_review` | `cho_duyet_kich_ban` + `cho_duyet_video` |
| `overdue` | `deadline < now AND status != da_len_ads` (§6.7, cross-cutting) |
| `published` | `da_len_ads` |
| `ads_running` | current `AdsMetric.delivery_status == "active"` (latest synced, else manual) |

`total = in_production + pending_review + published` always holds; `overdue`
and `ads_running` overlay the buckets.

**Scope.** A project manager (`project_role == "manager"` on ≥ 1 project) gets
`mode: "manager"` over every project they manage. Anyone else gets `mode:
"staff"` — the same counters but only over items assigned to them (§5.6 R1
bullet 3: no project/dept dashboard for staff). The per-role hard limit +
enforcement tests are task 8.7; this endpoint already scopes the data.

The pure formula (`computeProgressDashboard`) lives in `src/lib/domain/analytics.ts`
and is unit-tested against sample data; the service (`dashboard.server.ts`) just
gathers the rows (chunked `in` queries, no composite index). Realtime push is
task 7.6 (`useDashboardRealtime`).

## Per-person workload (task 8.2)

`GET /api/dashboard/people?from=<ms>&to=<ms>` → one row per person:

| field | meaning |
|---|---|
| `in_progress` | assigned + status ∉ {da_duyet, da_len_ads} — the person's job ends at approval |
| `completed_in_period` | items whose `to_status == "da_duyet"` StatusHistory entry falls in `[from, to)` |
| `overdue` / `has_overdue` | assigned + `is_overdue` (§6.7) |
| `avg_lead_time_ms` | mean (`da_duyet` time − item's **earliest** StatusHistory time) over the items completed in the period; `null` when none |

"nhận việc" is proxied by the item's first StatusHistory entry — assignment
isn't recorded in StatusHistory, and the checklist says the lead time is computed
**from StatusHistory**. `from`/`to` (epoch ms) bound the period; default is the
current UTC calendar month. The report's week-start / timezone rule (Open
Question Q4) is not needed here — the caller passes explicit bounds — and lands
with task 8.3. Scope (`resolveAnalyticsScope`, shared with 8.1): manager → every
member of their managed projects; anyone else → just their own row.
