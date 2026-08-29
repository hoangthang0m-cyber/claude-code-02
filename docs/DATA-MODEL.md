# Data model

Implements `docs/SPEC.md` §6.1 on Firestore.

## No SQL migrations

Firestore is schemaless: collections appear on first write and disappear when
their last document is deleted. There is nothing to "migrate up/down". The
schema lives in two places:

- **`src/lib/domain/`** — TypeScript interfaces (the read model) and Zod
  write-schemas (server-side validation before every Admin SDK write). Field
  names and enum values are exactly as §6.1 (snake_case).
- **`firestore.rules`** — access control. Client code reads only; every write to
  a tracker collection goes through a `/api` route handler using
  `firebase-admin`.

"Migration up/down clean" (§7.1 task 1.2) is verified by
`src/lib/domain/domain.test.ts`: each schema accepts a valid body and rejects a
bad enum value or a missing required field.

## Collections (group 7.1 task 1.2)

All top-level, linked by id fields (§6.1's flat model):

| Collection | Entity | Key links |
|---|---|---|
| `users` | User | — |
| `projects` | Project | `created_by` → users |
| `projectMembers` | ProjectMember | `project_id`, `user_id` |
| `contentItems` | ContentItem | `project_id`, `assignee_id` |
| `statusHistory` | StatusHistory | `content_item_id`, `actor_id` |
| `comments` | Comment | `content_item_id`, `author_id` |

`contentItems` adds `content_format` (`reels | tvc | photo`, optional) per
SPEC §8 Q3.

## Collections (group 7.1 task 1.3)

| Collection | Entity | Key links |
|---|---|---|
| `adAccountConnections` | AdAccountConnection | `project_owner_id` → users |
| `adsBindings` | AdsBinding | `content_item_id`, `ad_account_id` |
| `adsMetrics` | AdsMetric | `content_item_id` |
| `sheetSyncMappings` | SheetSyncMapping | `project_id` |
| `syncRuns` | SyncRun | `project_id` |
| `syncConflicts` | SyncConflict | `project_id`, `content_item_id` |
| `notifications` | Notification | `recipient_id`, `content_item_id?`, `project_id?` |
| `notificationPreferences` | NotificationPreference | `user_id` |

Access:

- `adAccountConnections` holds `token_encrypted` → **no client read at all**
  (`allow read, write: if false`); the "connected" state reaches the UI through
  a server response.
- `notifications` — recipient reads and marks read; the engine creates/deletes
  server-side.
- `notificationPreferences` — each user reads/writes their own rows.
- Everything else — client read, no client write.

## Representation notes (field names unchanged from §6.1)

- `id` is the Firestore document id, not stored in the document body.
- `created_at` / `updated_at` are set with `FieldValue.serverTimestamp()`.
- Actor fields (`created_by`, `actor_id`, `author_id`) are taken from the
  verified auth context, never from the request body.
- `Comment.mentions` is stored as `string[]` of user ids (not embedded user
  docs); §6.1 writes it as `User[]`.
- `Project` carries `created_at` / `updated_at` (the ContentItem convention in
  §6.1); the sketch omits them for Project.
- `ContentItem.evaluation` (SPEC §5.4 R5) is manager-only, set via its own
  endpoint `PATCH /api/content/[id]/evaluation`; the write also stamps
  `evaluation_by` + `evaluation_updated_at` (§6.1 sketches only `evaluation`, but
  R5 requires "kèm thời điểm + người ghi" — same reason `updated_by` was added).
- `AdAccountConnection.project_owner_id` is read as the **user id of the manager
  who ran the Meta OAuth** (SPEC §5.4 R1, §6.4).
- `SheetSyncMapping` doc id = `project_id` (one per project, SPEC §5.5 R1) and
  carries `updated_at` + `snapshot` beyond the sketch. `column_map` keys are the
  system field names in `SHEET_INBOUND_FIELDS` (+ ads fields for the push-down,
  task 6.5); `code` is mandatory (the row key). Saving one runs the first
  sheet→system pull, matching/creating `ContentItem`s by `code` and setting
  their `sheet_row_ref = code` (SPEC §6.3's natural-key row match). Invalid enum
  values (status / content_format) and unresolved assignee names are skipped
  per-field with a warning, not a failure (SPEC §5.5 R1).
- `SheetSyncMapping.snapshot` (task 6.4) is `{ <code>: { <field>: <cell> } }` —
  the mapped cell values at the previous sync. The delta pull diffs the sheet
  against it, so only changed cells / new rows are applied; it is re-captured
  after every sync. Not in the §6.1 sketch (§6.3 mandates a snapshot but gives
  it no home). Only inbound fields (`SHEET_INBOUND_FIELDS`) go in the snapshot —
  ads columns (`SHEET_ADS_FIELDS`) are push-only (task 6.5, SPEC §6.2) so a
  hand-edit of an ads cell is never read back.
- `googleConnections` (task 6.1) is a collection NOT in the §6.1 sketch — §6.3
  mandates storing the manager's Google refresh token but §6.1 gives it no home.
  Doc id = the manager's user id; `{ user_id, email, refresh_token_encrypted,
  scopes[], state: connected|needs_reconnect, connected_at }`. Client has no
  access (firestore.rules `read, write: if false`); the Sheets sync reads it
  server-side and refreshes the access token per run.
- `ContentItem.sheet_unlinked_at` (task 6.7) is a nullable Timestamp beyond the
  §6.1 sketch. When a row that had been synced disappears from the sheet, the
  delta pull keeps the `ContentItem`, sets `sheet_row_ref = null`, stamps
  `sheet_unlinked_at`, and notifies every project manager (`Notification` type
  `sync_issue`). It is cleared (`null`) and `sheet_row_ref` restored if a row
  with that `code` reappears. An already-unlinked item is not re-notified.
- `SyncConflict.system_value` / `sheet_value` store the **serialised string**
  form of each side's value, for the log (§5.5 R3). A conflict is detected when
  the same field's value differs from the last-sync `snapshot` on BOTH sides
  (task 6.6); `conflict_rule` (`system_wins` default) decides `chosen_side`, and
  on `system_wins` the sheet value is not applied — the next push writes the
  system value back down.
- `SyncRun` is written once per background/manual sync attempt (task 6.8), so
  the "last sync" time, result and rows read/written come straight off the newest
  `kind: "sheets"` doc. The sync-status/log screen (`GET
  /api/projects/[id]/sheet/sync`) reads the project's `syncRuns` + `syncConflicts`
  and sorts/caps in memory (no composite index, same as the other list
  endpoints); any project member may read it. The background cron
  (`syncAllProjectSheets`) only touches a project whose `lifecycle` is `running`
  — `done` / `archived` keep their mapping but are left alone until reopened
  (§5.1 R3); it reports a `skipped` count alongside `ok` / `errors`.
- `SheetSyncMapping.sync_enabled` (task 6.9; absent → `true` for mappings saved
  before the flag) is the per-project on/off switch (SPEC §5.5 R4). `false` stops
  every sync — background **and** manual "đồng bộ ngay" (409) — while touching no
  data on either side. `sync_disabled_reason` records why: `"manual"` (a manager
  flipped it via `PATCH /api/projects/[id]/sheet/mapping`) or `"permission_lost"`
  (a run hit a 401/403/409 from Google, so `runSync` paused the project itself
  and queued a `sync_issue` notification to every manager — R4 first bullet).
  `sync_disabled_at` stamps when; both reason and timestamp are cleared when
  sync is turned back on.
- `Notification` uses `recipient_id` (per §6.1). The pre-existing, unused
  `notifications` rule keyed on `userId` has been replaced. Every doc is written
  by the notification engine (`emitNotifications`, task 7.2) from the §5.7 R1
  event → recipient table; the engine always drops the acting user, so a
  self-claim / self-approve / own comment produces nothing. `read_at` starts
  `null`. `content_overdue` is in the table but has no trigger yet (no write
  event marks "became overdue" — it needs a scheduled deadline scan that no
  checklist task defines).
- `NotificationPreference` doc id is `${user_id}__${group}` (deterministic, one
  row per user+group), and the row is written only when a user turns a group
  **off** — its absence, or `enabled: true`, means the group is on (opt-out
  model, §5.7 R4). The engine reads `${uid}__${group}` with one `get()` per
  recipient before writing; the settings panel (`/ad-accounts`) toggles the
  caller's own rows via `GET/PUT /api/notification-preferences`.
- `AdsBinding` carries three fields beyond the §6.1 sketch: `active` (bool),
  `unbound_at` (nullable Timestamp), and `sync_error_since` (nullable Timestamp —
  set by the sync job when Insights fetches for this object keep failing, cleared
  on the next success; an alert fires only after > 24h, SPEC §5.4 R3). Unbinding
  (task 5.3) is a soft delete —
  `active` → false, `unbound_at` stamped — so the sync job skips it (SPEC §5.4
  R2: "dừng đồng bộ phần đó") while the row and its append-only `AdsMetric`
  history stay ("giữ số liệu lịch sử, đánh dấu đã ngừng cập nhật"). Doc id is
  `${content_item_id}__${object_id}` so re-binding the same object reactivates
  the existing row.
- `AdsMetric` is append-only. The **current** value of a content item is the
  latest `source=synced` row; only when no synced row has ever been written does
  the latest `source=manual` row show (SPEC §6.1, §5.4 R4). A manual entry
  (`POST /api/content/[id]/ads-metrics`, manager only) never overwrites — it
  stays in history and is superseded once a sync succeeds.
- `AdsMetric.cost_per_purchase` replaces the §6.1 sketch's `cost_per_message`:
  SPEC §8 Q1 was answered "CPP = Cost Per Purchase" (Meta `cost_per_action_type`
  for `omni_purchase`). `messages` still holds the count of
  `messaging_conversation_started` conversations. The sync job (task 5.4) appends
  one aggregated `source=synced` row per content item per run — a lifetime
  cumulative snapshot (`date_preset=maximum`) with `data_as_of = now`; cadence
  6h / 12h / 24h by lifecycle + delivery status (Q5).

## Realtime (SPEC §6.6 / §5.6 R3, tasks 7.1 / 7.6)

The realtime "room" for a project is a **client** Firestore listener scoped to
`contentItems where project_id == <projectId>` (`useProjectRealtime`) — this is
the WebSocket/SSE channel §6.6 asks for (the Firebase Web SDK streams it). The
listener does **not** render those docs: the filtered/sorted content list still
comes from `GET /api/projects/[id]/content` (task 5.2, and the `contentItems`
read rule is tightened in a later task). It is only a change signal + a
connection gauge:

- a server snapshot carrying a doc change → `useContentItems` refetches the list;
- while the channel is `live` the list also polls slowly (60s safety net); while
  it is `offline` it polls at the SPEC §6.6 fallback rate (12s, within 10–15s);
- the Firebase SDK reconnects on its own; on recovery the channel forces one
  resync refetch (§6.6 R3: never sit on stale rows silently) and the table shows
  a "mất kết nối tức thời" note while `offline`.

The pure fold (`nextRealtimeStatus` / `pollIntervalMs` / `didReconnect` /
`shouldRefetchOnSnapshot` / `aggregateRealtimeStatus`) lives in `src/lib/realtime.ts`
and is unit-tested; the `onSnapshot` wiring is the thin hook around it. In-app
notifications stay a separate channel (30s poll, task 7.3) so history does not
depend on the realtime connection.

**Dashboard (task 7.6).** A manager's progress dashboard spans every project
they manage, so `useDashboardRealtime(projectIds)` opens one `contentItems` room
listener per project and folds them: the overall channel is `live` only when
every room is, `offline` if any room is (some numbers may be stale). All the
dashboard counts (total / đang sản xuất / chờ duyệt / quá hạn / đã lên ads)
derive from `ContentItem` status + deadline, so a change in any project bumps
`changeToken` within a second and the dashboard refetches. **Ads-derived figures
(spend, "ads đang chạy") are not pushed** — `AdsMetric` has no `project_id` to
scope a room by, and the ads sync is a ~6h cron with no interactive change to
miss; those numbers refresh on the dashboard's own poll (≤60s). Adding
`AdsMetric.project_id` for a true ads room is an open call for the user.

## Progress dashboard (SPEC §5.6, tasks 8.1 / 8.2)

No new collection. `resolveAnalyticsScope` (shared) reads `projectMembers` for
the caller: a project manager → `mode: "manager"` over the projects they manage;
anyone else → `mode: "staff"` over their own assigned items (§5.6 R1 bullet 3).

- **`GET /api/dashboard` (8.1)** reads `contentItems` (+ `adsMetrics` for "ads
  đang chạy") in scope and folds them with `computeProgressDashboard`
  (`src/lib/domain/analytics.ts`). `total = in_production + pending_review +
  published`; the split is `PENDING_REVIEW_STATUSES` (`cho_duyet_*`), `da_len_ads`
  (published), and the complement (in production). `overdue` / `ads_running`
  overlay the buckets.
- **`GET /api/dashboard/people?from&to` (8.2)** joins `contentItems` with the
  `statusHistory` of those items: `avg_lead_time_ms` = mean (`da_duyet` entry
  time − the item's earliest history entry time) over items approved in
  `[from, to)`. "nhận việc" is proxied by that earliest entry because assignment
  isn't in StatusHistory. `from`/`to` are epoch ms; default = current UTC month.
- **`GET /api/dashboard/report?period=week|month&date` (8.3)** — §5.6 R3 metrics
  over the cohort that hit `da_len_ads` inside the period. `returns` counts
  `statusHistory` entries whose `(from_status, to_status)` is a state-machine
  `return` pair, in the period. Ads figures use each cohort item's **current**
  (cumulative) AdsMetric — the sync writes lifetime snapshots (§8 Q1), not
  period deltas, so the report is "this period's content, and how its ads did".
  `has_data = throughput > 0` drives the "chưa có dữ liệu trong kỳ" label.
  **§8 Q4 (answered 2026-08-29):** the period is resolved server-side in
  **Asia/Ho_Chi_Minh (UTC+7, no DST)**, **Monday** week start — `resolveReportPeriod`
  (`src/lib/domain/reportPeriod.ts`); it also gives the previous period for 8.4.

All chunked `in` queries + in-memory counting — no composite index.

## Transitional note

The pre-existing `/campaigns` feature stores content in the
`campaigns/{id}/contentItems` **subcollection** with a different shape
(`status: draft | recording | ...`). A `collectionGroup("contentItems")` query
(used by the current `/reports` and campaigns overview) will also match the new
top-level `contentItems`. Both old screens are rebuilt in groups 7.2–7.3 / 7.8;
until then the old `/reports` may show transitional rows. No production data.
