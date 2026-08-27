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

Group 7.1 task 1.3 adds: `adAccountConnections`, `adsBindings`, `adsMetrics`,
`sheetSyncMappings`, `syncRuns`, `syncConflicts`, `notifications`,
`notificationPreferences`.

## Representation notes (field names unchanged from §6.1)

- `id` is the Firestore document id, not stored in the document body.
- `created_at` / `updated_at` are set with `FieldValue.serverTimestamp()`.
- Actor fields (`created_by`, `actor_id`, `author_id`) are taken from the
  verified auth context, never from the request body.
- `Comment.mentions` is stored as `string[]` of user ids (not embedded user
  docs); §6.1 writes it as `User[]`.
- `Project` carries `created_at` / `updated_at` (the ContentItem convention in
  §6.1); the sketch omits them for Project.

## Transitional note

The pre-existing `/campaigns` feature stores content in the
`campaigns/{id}/contentItems` **subcollection** with a different shape
(`status: draft | recording | ...`). A `collectionGroup("contentItems")` query
(used by the current `/reports` and campaigns overview) will also match the new
top-level `contentItems`. Both old screens are rebuilt in groups 7.2–7.3 / 7.8;
until then the old `/reports` may show transitional rows. No production data.
