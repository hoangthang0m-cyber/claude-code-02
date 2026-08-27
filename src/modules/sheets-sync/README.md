# sheets-sync

SPEC `docs/SPEC.md` §5.5 · checklist group 7.6.

Two-way sync between a project and one external Google Sheet tab: column
mapping (`sheetSyncMappings`), a ≤ 5 min background cycle plus "sync now",
snapshot-delta change detection, conflict detection with a configurable
priority rule (default `system_wins`, logged to `syncConflicts`), and a
sync status/log screen (`syncRuns`).

Ads metrics are pushed **one way down to the sheet only** and are never read
back (SPEC §6.2).
