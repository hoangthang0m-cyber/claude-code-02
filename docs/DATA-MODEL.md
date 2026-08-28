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
- `AdAccountConnection.project_owner_id` is read as the **user id of the manager
  who ran the Meta OAuth** (SPEC §5.4 R1, §6.4).
- `SyncConflict.system_value` / `sheet_value` store the **serialised string**
  form of each side's value, for the log (§5.5 R3).
- `Notification` uses `recipient_id` (per §6.1). The pre-existing, unused
  `notifications` rule keyed on `userId` has been replaced.
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

## Transitional note

The pre-existing `/campaigns` feature stores content in the
`campaigns/{id}/contentItems` **subcollection** with a different shape
(`status: draft | recording | ...`). A `collectionGroup("contentItems")` query
(used by the current `/reports` and campaigns overview) will also match the new
top-level `contentItems`. Both old screens are rebuilt in groups 7.2–7.3 / 7.8;
until then the old `/reports` may show transitional rows. No production data.
