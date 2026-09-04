# Manual end-to-end walkthrough — Nhóm dự án (project-grouping task 6.6)

Click through the grouping feature in a browser after a deploy that touches
`/campaigns` or the analytics. The service layer is also covered automatically —
see `src/modules/project-grouping/services/*.integration.test.ts` (group
lifecycle, roll-up == manual sum, sort_index stability) and the `*.permissions`
tests.

## Prerequisites

- A **Trưởng phòng (manager)** `M` — a system manager who is a project-level
  manager of at least the two projects used below.
- A **Nhân sự (staff)** `S` who is a member (not manager) of one of them.
- Two existing projects `P1`, `P2` (UGC campaigns), plus one unrelated `P3`.
- `firestore.rules` deployed with the `projectGroups` block.
- One-time: run `npm run backfill:sort-index -- --write` so existing projects
  have a `sort_index` (otherwise they sort by `created_at` until first drag —
  still correct, just not re-orderable in a stable way).

## Steps

| # | As | Action | Expected |
|---|---|---|---|
| 1 | M | `/campaigns` | Projects are shown grouped: one block **"Chưa phân nhóm"** listing `P1 P2 P3`. A **"Nhóm đã lưu trữ"** checkbox is in the header. |
| 2 | M | **Tạo dự án mới** → fill name + objective → the new **"Nhóm dự án"** select shows **"Chưa phân nhóm"** by default → leave it → Lưu | The new project appears in the "Chưa phân nhóm" block, at the end. |
| 3 | M | Header → **Nhóm mới** → type `UGC ROAS 2.0` → OK | An empty block **"UGC ROAS 2.0 (0)"** appears with a dashed "chưa có dự án" placeholder and a **"＋ dự án"** menu. |
| 4 | M | In the **UGC ROAS 2.0** block header → **＋ dự án** → pick `P1`, then again → pick `P2` | `P1` and `P2` move into the group block; the "Chưa phân nhóm" block now shows only `P3`. Count reads **(2)**. |
| 5 | M | Drag `P2` above `P1` using the grip handle (top-right of the card) | Order flips to `P2 P1`. Reload the page → order is still `P2 P1` (saved server-side). |
| 6 | S | Open `/campaigns` | Same grouping and order as M sees for the shared project. **No** grip handle, **no** "＋ dự án" menu (staff can't reorder or assign). |
| 7 | M | Collapse the "UGC ROAS 2.0" block (click its title) → reload | The block stays collapsed after reload (localStorage). |
| 8 | M | In the group block header → **Xem tổng hợp** | Opens `/campaigns/groups/<id>`: 6 stat cards rolled up over `P1 + P2`, header says **"Đang tính 2/2 dự án trong nhóm"**. No "theo nhân sự" table. |
| 9 | M | On the roll-up page → **Tháng** + a date with ads data → check numbers | Throughput / spend / messages / weighted ROAS equal the sum of `P1` and `P2`'s own monthly reports. |
| 10 | M | Tick **So sánh với kỳ trước** | Each metric gains "Kỳ trước" + "Thay đổi" columns. |
| 11 | M | **Xuất CSV** | Downloads `bao-cao-nhom-month-<date>.csv`: one column per child project (`P1`, `P2`), one row per metric, **no "Tổng nhóm"** column or row. |
| 12 | M | In the group block → **＋ dự án** → pick `P3`; then block header **⋮** → **Lưu trữ** | The block disappears from the default list. `P1 P2 P3` are still real projects — tick **"Nhóm đã lưu trữ"** → the block reappears with an **"Đã lưu trữ"** badge and its projects, and a **⋮ → Bỏ lưu trữ / Xoá nhóm** menu. |
| 13 | M | On the archived block → **⋮** → **Xoá nhóm** → confirm | Toast "Đã xoá nhóm — 3 dự án về Chưa phân nhóm". `P1 P2 P3` are all back in **"Chưa phân nhóm"**; none was deleted. |

## Notes

- **Đổi tên / Lưu trữ / Xoá nhóm** use a native `prompt` / `confirm` in this
  build; a proper dialog is a cosmetic follow-up.
