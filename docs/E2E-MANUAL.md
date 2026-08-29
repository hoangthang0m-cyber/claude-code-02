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

## Realtime spot-check (feeds checklist 9.7)

Open the same project's content table in two browser sessions (M and S). Have
`S` change a status; M's table updates within a few seconds without a reload.
Kill M's network briefly — the table shows "mất kết nối tức thời — đang làm mới
định kỳ"; restore it — the listener reconnects and the rows resync.
