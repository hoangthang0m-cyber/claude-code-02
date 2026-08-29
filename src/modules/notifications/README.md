# notifications

SPEC `docs/SPEC.md` §5.7 · checklist group 7.7.

In-app notifications by the event → recipient table in §5.7 R1, a bell with an
unread badge and mark-as-read, near-real-time updates for the content table and
dashboard, and per-group notification preferences (`notificationPreferences`).

Realtime (§6.6) and the notification store are two separate channels: realtime
via the Firebase Web SDK, notification history via `notifications` docs polled
every 30s.

## The engine (task 7.2)

`services/notificationEngine.server.ts` — `emitNotifications(db, batch, event)`
is the single entry point. It owns:

- the **event → recipient table** (`notificationRecipients`), mirroring §5.7 R1:

  | event | recipients |
  |---|---|
  | `content_assigned` | the assignee |
  | `review_requested` | the project managers |
  | `review_approved` / `review_returned` | the assignee |
  | `content_overdue` | the assignee + the project managers |
  | `ads_stopped` | the project managers |
  | `comment_added` | assignee + managers, minus anyone already told |
  | `comment_mention` | exactly the people named |
  | `sync_issue` | the project managers |

- the **"never notify the actor"** rule — `event.actor_id` (the person who
  caused it, or `null` for a system/cron event) is removed from every recipient
  set;
- the message templates (item events template from `code`; `sync_issue` carries
  its own message).

Callers pass an `actor_id` and the event payload; they never assemble the
recipient list themselves. Wired at: content assign, comment create, workflow
submit/approve/return, ads sync (ads stopped), sheet sync (row unlinked, access
lost).

Preference filtering (§5.7 R4) layers onto the recipient list in task 7.5.

## The read side (task 7.3)

`GET /api/notifications?limit=30` → `{ unread_count, items: NotificationView[] }`
(`services/notifications.server.ts`). Scoped to `recipient_id == caller`, sorted
newest-first and capped in memory (no composite index, same as the other list
endpoints). `unread_count` counts **every** unread notification, not just the
page, so the bell badge is exact even when the list is truncated. The client
(`notifications.client.ts`) polls it every 30s — the mark-read mutations and the
bell UI come in task 7.4.


**Not yet wired:** `content_overdue` has no trigger — "becoming overdue" is a
time transition with no write event, so it needs a scheduled deadline scan. No
checklist task creates that scan; the engine route is ready for it.
