# Team Activity Calendar — Firestore read-cost analysis (task 13.4)

Measured/estimated 2026-09-08 against the built implementation on branch
`feat/team-activity-calendar`. Scale assumption: **one marketing team**, ~20
active members, ~5 shared calendars + 20 personal calendars, and a working set of
**~60 calendar items per month** with ~5 recurring masters (avg 3 exceptions
each).

## What a "view 1 month" session costs

`MonthGrid` asks for a 42-day window. `useCalendarItems` (Mục C §2) runs, per
window:

| Query | Firestore reads | Rules `get()` / `exists()` |
|---|---|---|
| Short items, dayKey batch A (≤30 days) | items in batch A | 1 × `exists(members/{uid})` |
| Short items, dayKey batch B (remaining 12 days) | items in batch B | 1 |
| Long-span items (`isLongSpan == true`) | long-span items | 1 |
| Recurring masters (`isRecurring == true`) | recurring masters | 1 |
| `exceptions` subcollection — one query per recurring master | ~3 per master | 1 per master |

Plus the one-time providers (`CalendarDataProvider` + `useVisibleCalendars`):

| Stream | Reads | Rules |
|---|---|---|
| `config/calendarSettings` | 1 | 1 |
| `members` (active) list | ~20 | 1 |
| `calendars` list | ~25 | 1 |
| `userCalendarPrefs/{uid}` | 1 | 0 (`isOwner`, no `get()`) |
| `calendarNotifications/{uid}/items` (bell, limit 30) | ≤30 | 0 (`isOwner`) |

**Totals for the first month-view load:**

- **Document reads:** ~60 (items) + ~5 (masters) + ~15 (exceptions) + ~46
  (providers + bell) ≈ **~130 reads**.
- **Rules `get()`/`exists()`:** 4 (view queries) + 5 (one per master's
  exceptions) + 3 (providers) ≈ **~12 lookups**, each a single
  `exists(/members/{uid})` or a `calendars` list-rule eval. **The read rule only
  ever does one `exists(members/{uid})` per query** — it never touches
  `resource`, so a query returning 60 docs still costs 1 lookup, not 60. The
  2-`get()` ceiling in Mục C §6 Risks refers to the *write* path
  (`canWriteCalendar` → `get(calendars/{id})`), and the app's writes go through
  `/api/**` + firebase-admin, which bypass rules entirely.

**Navigating to another month** re-runs the 4 view queries + the per-master
exceptions queries: **~80 reads + ~9 lookups** per month step (providers stay
subscribed, not re-read). `onSnapshot` then bills 1 read per changed document
while the listener is open.

A heavy day — 30 month-steps, a few view switches — is on the order of **~3–4k
reads**. The Firestore Blaze free grant is **50k reads/day**; a 20-person team
sits comfortably inside it.

## The one thing to watch: search (group 12)

`useCalendarSearch` runs `getDocs(calendarItems where deletedAt == null)` — the
**whole** non-deleted set — on each debounced (250 ms) keystroke. Cost per fetch
= (total live items) reads + 1 lookup.

- Today (~a few hundred items): a full search session is a few hundred reads —
  negligible.
- At **~5,000 live items**, one search session (3–4 debounced fetches) is
  ~15–20k reads — a meaningful slice of the daily grant.

**Recommendation:** leave as-is for v1. Revisit when the live-item count passes
~3,000 (the daily cleanup job keeps soft-deleted rows from counting). Options
then, cheapest first: (a) cap the search query to a rolling ±12-month
`startDay` window; (b) add a lightweight external search index
(Typesense/Algolia) fed by the item-write path.

## Role in custom claims?

**Not needed.** The read rule's single `exists(members/{uid})` per query is the
only role-adjacent lookup on the hot path, and it doubles as the membership
check (task 11.2). Moving `role` to a custom claim would remove ~4 `exists()`
calls per month-view load (~sub-1% of the read bill) at the cost of a token
refresh on every role change. Keep `members/{uid}.role` as the source; reconsider
only if a future feature makes rules `get()` the dominant cost.

## Index footprint

7 composite indexes (`firestore.indexes.json`), all leading with `deletedAt` so
the implicit soft-delete filter is always covered. No `dayCounts` collection
(answer #5). The daily `calendar-cleanup` job bounds `calendarItems` and
`dueReminders` growth.
