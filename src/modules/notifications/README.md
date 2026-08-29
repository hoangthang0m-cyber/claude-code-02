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

### Preference filtering (task 7.5)

`emitNotifications` drops every recipient who muted the event's group before it
writes anything (`NOTIFICATION_TYPE_GROUP` maps the 9 types onto the 6 toggle
groups). Opt-out model: one `notificationPreferences/${uid}__${group}` row, and
its absence (or `enabled: true`) means keep. `GET/PUT /api/notification-preferences`
(`notificationPreferences.server.ts`) list/toggle a user's own groups; the panel
is on the settings page (`/ad-accounts`).

## The read side (task 7.3)

`GET /api/notifications?limit=30` → `{ unread_count, items: NotificationView[] }`
(`services/notifications.server.ts`). Scoped to `recipient_id == caller`, sorted
newest-first and capped in memory (no composite index, same as the other list
endpoints). `unread_count` counts **every** unread notification, not just the
page, so the bell badge is exact even when the list is truncated. The client
(`notifications.client.ts`) polls it every 30s.

## The bell (task 7.4)

`components/NotificationBell.tsx` in the dashboard header (`SiteHeader`):

- badge = `unread_count` (`99+` past 99), hidden at 0;
- a popover dropdown lists the recent items — unread ones get a dot + tint;
- clicking an item marks it read (`PATCH /api/notifications/[id]`) and routes to
  `notificationHref(n)` — the content item's project page anchored `#item-<id>`
  (there is no standalone item route), else the project page, else `/campaigns`;
- "Đánh dấu tất cả đã đọc" → `POST /api/notifications/read-all` (`markAll`),
  badge to 0.

`hooks/useNotifications.ts` polls every 30s and applies mark-read optimistically,
reconciling on the next poll (or an immediate refresh on failure). Mark-read is
recipient-only, enforced server-side (`markNotificationRead` / `firestore.rules`).


**Not yet wired:** `content_overdue` has no trigger — "becoming overdue" is a
time transition with no write event, so it needs a scheduled deadline scan. No
checklist task creates that scan; the engine route is ready for it.
