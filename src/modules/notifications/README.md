# notifications

SPEC `docs/SPEC.md` §5.7 · checklist group 7.7.

In-app notifications by the event → recipient table in §5.7 R1, a bell with an
unread badge and mark-as-read, near-real-time updates for the content table and
dashboard, and per-group notification preferences (`notificationPreferences`).

Realtime (§6.6) and the notification store are two separate channels: realtime
via the Firebase Web SDK, notification history via `notifications` docs polled
every 30s.
