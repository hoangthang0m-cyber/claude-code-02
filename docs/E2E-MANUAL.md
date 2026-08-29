# Manual end-to-end walkthrough (SPEC checklist 9.6)

The full happy path, clicked through in a browser. Do this after every deploy
that touches the pipeline, sheets, ads, or analytics. The service-layer chain is
also verified automatically — see the temp live E2E pattern in the project
memory (`_live96`) and the committed integration tests (`*.integration.test.ts`).

## Prerequisites

- Two accounts: a **Trưởng phòng (manager)** `M` and a **Nhân sự (staff)** `S`.
  `M` must be a system manager (first-seeded account, or promoted — see
  `docs/ENV.md` / `scripts/seed-manager.mjs`).
- `M` has connected their Google account on **Cài đặt** (`/ad-accounts`) — the
  panel shows "Đã kết nối".
- A Google Sheet `M` can edit, with a header row `Mã | Trạng thái | Chủ đề` and
  one data row, e.g. `E2E-1 | chua_bat_dau | Video chính`.
- (Optional, for the real Meta step) `M` has connected a Meta Ad Account with at
  least one live campaign/ad. Without it, use the manual-metric fallback in
  step 8.
- `firestore.rules` deployed with the `googleConnections` block; Vercel env
  vars set (`TOKEN_ENC_KEY`, `CRON_SECRET`, `GOOGLE_OAUTH_*`).

## Steps

| # | As | Action | Expected |
|---|---|---|---|
| 1 | M | `/campaigns` → **Tạo dự án** → name + objective → Lưu | Project opens; M is its Trưởng phòng; lifecycle "Đang chạy". |
| 2 | M | Project page → **Thành viên** → add `S` as Nhân sự (nhãn Content) | `S` appears in the member list. |
| 3 | M | **Đồng bộ Google Sheets** panel → paste the sheet URL → **Kiểm tra** | Shows tab name + "đọc + ghi được" + column count. |
| 4 | M | Map `Mã→code`, `Trạng thái→status`, `Chủ đề→topic` → **Lưu & đồng bộ lần đầu** | Toast "Đã lưu … 1 tạo mới". The content table shows a row **E2E-1**, status *Chưa bắt đầu*, topic *Video chính*. |
| 5 | M | Content table → row E2E-1 → **Nhân sự** dropdown → choose `S` | Row shows `S`; `S` gets a "được giao hạng mục" notification (bell badge +1 for S). |
| 6 | S | Open the project → E2E-1 → move status to **Viết kịch bản** | Row status updates live (M's open table changes within ~1s). |
| 7 | S | Fill **Kịch bản** URL → submit for review (**Chờ duyệt kịch bản**) | Rejected until the link is filled; then status = *Chờ duyệt kịch bản*; M gets a "chờ duyệt kịch bản" notification. |
| 8 | M | E2E-1 → **Duyệt** (→ Quay/Dựng) | Status = *Quay/Dựng*; `S` gets "đã được duyệt". Try **Trả lại** on a second item to confirm it needs a reason and notifies `S`. |
| 9 | S | Fill **Video** URL → submit (**Chờ duyệt video**) | Same link gate; status = *Chờ duyệt video*. |
| 10 | M | **Duyệt** → *Đã duyệt* | `S` notified. |
| 11 | M | **Đã lên ads** — either bind a Meta campaign (**Báo cáo ads** cell → gắn) then publish, **or** publish with confirm | With a binding: publishes directly. Without: a prompt to confirm + a reminder to attach a campaign; status = *Đã lên ads*. |
| 12 | — | **Meta path:** wait for the hourly `ads-sync` cron (or trigger `/api/jobs/ads-sync` with the `CRON_SECRET`). **Manual path:** M opens the **Báo cáo ads** cell → nhập tay spend / Mess / ROAS / CPP / CTR | The ads cell shows the figures with `data_as_of`. If the ad later goes paused, M gets an "ads đã dừng" notification. |
| 13 | M | E2E-1 → **Đánh giá** cell → write a note → blur | Note saved (manager-only; `S` cannot edit it). |
| 14 | M | Sidebar **Dashboard & báo cáo** → **Tổng quan** tab | Stat cards: *Đã lên ads* ≥ 1, *Tổng* ≥ 1. Cards update live. "Theo nhân sự" row for `S` — click it → a drawer lists E2E-1, filterable by status. |
| 15 | M | **Báo cáo tuần/tháng** tab → period = **Tuần**, date = today | `throughput` ≥ 1, `total_spend` ≥ the entered spend, E2E-1 in "Top hạng mục theo ROAS". Toggle **So sánh với kỳ trước** → a "Kỳ trước" column + delta appears. **Xuất CSV** downloads a file whose numbers match the screen. |
| 16 | S | Open **Dashboard & báo cáo** | Only `S`'s own numbers — no project/dept dashboard, no other people's rows (SPEC §5.6 R1 bullet 3). |

## Realtime check (SPEC §5.7 R3 / §6.6, checklist 9.7)

Two browser sessions on the **same project's content table** — `M` in one, `S`
in the other. The channel is a Firestore `onSnapshot` on
`contentItems where project_id ==` (`useProjectRealtime`), used as a change
signal + a connection gauge; the list itself refetches from the API.

### A. Cross-session propagation (< a few seconds)

| # | As | Action | Expected in the OTHER session |
|---|---|---|---|
| 1 | S | Move E2E-1 from *Chờ duyệt video* → *Quay/Dựng* (or M approves a script) | Within ~1–3s the row's status badge changes **without a reload**. |
| 2 | M | Change E2E-1's deadline or assignee | Same — the changed cell updates in S's table within a few seconds. |
| 3 | M | Kanban view (**Bảng → Kanban**) open in one session while the other moves an item | The card jumps columns within a few seconds. |

The upper bound is the poll fallback: even if the push is missed, the table
refetches every ≤ 60s while the channel is healthy (≤ 12s while it is down).
The service-layer propagation (a write → a listener firing) is measured
automatically — see the live E2E pattern for 9.7 (two admin listeners on one
room, latency asserted < 5s).

### B. Disconnect → reconnect, no silent stale (§6.6 R3)

| # | Action | Expected |
|---|---|---|
| 1 | In `M`'s session, DevTools → Network → **Offline** (or kill wifi) for ~20s | The header of the content table shows **"● mất kết nối tức thời — đang làm mới định kỳ"**. The table keeps polling every ~12s, so it is never more than ~12s stale. |
| 2 | While `M` is offline, have `S` change a status | `M` does **not** see it instantly, but the next 12s poll (still running) picks it up — or the reconnect does. |
| 3 | Restore `M`'s network | The listener reconnects on its own (Firebase SDK). On the first authoritative snapshot the channel goes back to `live`, the "mất kết nối" note disappears, and the table forces **one immediate resync fetch** (`didReconnect` → `changeToken` bump) — so any change made while offline is now shown. No stale row is left without the note having been visible. |
| 4 | Repeat with a longer outage (2–3 min) | Same recovery; the `EventSource`/WebChannel backoff is handled by the SDK. |

### C. Dashboard realtime (task 7.6)

Open **Dashboard & báo cáo → Tổng quan** as `M`. In another session move an item
to/from *Đã lên ads* or *Chờ duyệt*. The relevant stat card count changes within
a second or two (`useDashboardRealtime` opens one room listener per managed
project). Ads-derived numbers (*Ads đang chạy*, spend in reports) refresh on the
dashboard's own ≤ 60s poll, not instantly — the ads sync is a ~6h cron.
