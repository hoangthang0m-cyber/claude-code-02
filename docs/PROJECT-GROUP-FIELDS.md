# Project Group Fields — thông tin cơ bản cho Nhóm dự án

Nguồn sự thật: OpenSpec change `project-group-fields`
(`tasks-docs/openspec/changes/project-group-fields/`). File này là bản làm việc
trong repo + checklist. Nếu code hiện tại mâu thuẫn với change → báo, không tự
quyết.

Nhóm dự án ("dự án to") có thêm: **mục tiêu** (bắt buộc khi tạo), **mô tả chi
tiết** (trường `description` cũ), **quy mô thời gian** dạng chữ
(`time_scope_text`, vd "3 tháng"), **ngày kết thúc dự kiến** (`target_end_date`,
chỉ để tính tình trạng thời gian), **ngân sách dự kiến** (`budget_amount` +
`budget_currency`). Trang tổng hợp Nhóm thêm khối "Thông tin nhóm" + khối "Ngân
sách & tiến độ thời gian" (chi phí thực tế = tổng chi phí dự án con **trong
khoảng đang xem**, đối chiếu % ngân sách, tình trạng thời gian). Nhóm **vẫn
không** là Dự án: không link tiến độ đồng bộ, không đúc kết, không hạng mục.

## Quyết định implementation

- **Đơn vị chi phí thực tế:** analytics roll-up cộng thẳng `AdsMetric.spend`
  (Meta trả theo tiền tệ tài khoản quảng cáo). Codebase không lưu tiền tệ theo
  từng metric, nên "đơn vị của chi phí thực tế" được chốt là **VND**
  (`ACTUAL_COST_CURRENCY` trong `projectGroup.ts`, khớp
  `DEFAULT_REPORTING_CURRENCY`). Nếu `budget_currency` khác VND → hiển thị 2 số
  riêng + ghi chú, không tự quy đổi (design.md Non-Goals).
- **Không có ngày bắt đầu.** Quy mô thời gian là chữ; `target_end_date` đứng
  riêng, chỉ cho computed time status. Không nhập → ẩn khối tình trạng thời gian.
- **Chi phí thực tế theo khoảng đang xem** trên trang tổng hợp (tuần/tháng +
  ngày người dùng chọn), luôn kèm nhãn khoảng để tránh hiểu nhầm là toàn nhóm.
- **Manager-only.** CRUD nhóm đã là `requireSystemManager`; trang tổng hợp đã
  403 cho non-manager (`resolveGroupScope`). Không thêm tầng quyền mới.

## Checklist

### 1. Data model
- [x] 1.1 Interface + Zod schema `ProjectGroup`: `objective` (create bắt buộc),
      `time_scope_text`, `target_end_date` (YYYY-MM-DD), `budget_amount` +
      `budget_currency` (cặp đôi). `groupNeedsObjective()`. 49 unit test.
- [x] 1.2 `createProjectGroup` từ chối thiếu `objective` (qua
      `parseOrThrow(projectGroupCreateSchema)`); server test.

### 2. Form và API Nhóm
- [x] 2.1 API tạo/sửa nhận thêm các trường (spread qua schema đã parse);
      manager-only sẵn có; server test cho update path + cặp ngân sách.
- [x] 2.2 `ProjectGroupFormSheet` — form tạo/sửa (Sheet) với tên, mục tiêu, mô
      tả chi tiết, quy mô thời gian (chữ), ngày kết thúc dự kiến, ngân sách +
      đơn vị. Thay `window.prompt` trong `GroupedProjectList` (tạo + "Sửa nhóm").
- [x] 2.3 `useProjectGroup(groupId)` hook + banner amber "chưa có mục tiêu" trên
      `GroupRollupView` khi `groupNeedsObjective(group)`; không chặn gì.

### 3. Trang tổng hợp Nhóm
- [x] 3.1 Khối "Thông tin nhóm" (Card) ở đầu trang — mục tiêu, mô tả, quy mô
      thời gian, ngày kết thúc, ngân sách; ẩn field chưa nhập.
- [x] 3.2 Chi phí thực tế = `cur.total_spend` (roll-up report) của kỳ đang xem;
      selector kỳ (tuần/tháng + ngày) chuyển lên đầu, điều khiển cả block + báo cáo.
- [x] 3.3 `computeGroupBudgetReconciliation` — % đã dùng, cảnh báo vượt + số
      tiền vượt (destructive); state `no_budget` ẩn phần ngân sách.
- [x] 3.4 State `currency_mismatch` → 2 số riêng + ghi chú amber.
- [x] 3.5 `periodLabel(kind, start_date)` cạnh chi phí + cạnh dòng "% ngân sách"
      + tiêu đề block báo cáo.
- [x] 3.6 `computeGroupTimeStatus(target_end_date, nowMs, 7)` — on_track /
      due_soon (≤7 ngày, amber) / overdue (destructive); ẩn khi không có ngày.

### 4. Kiểm thử & xác minh tích hợp
- [x] 4.1 `projectGroupFields.integration.test.ts` — tạo/sửa đủ trường, thiếu
      mục tiêu bị chặn, không ngày kết thúc (lưu + ẩn tình trạng), Nhân sự 403
- [x] 4.2 Nhóm cũ (schema project-grouping): `groupNeedsObjective` true, vẫn
      archive/restore, thêm mục tiêu sau được
- [x] 4.3 Đối chiếu ngân sách: within / over / no_budget / currency_mismatch
- [x] 4.4 Tình trạng thời gian: on_track / due_soon / overdue / null
- [ ] 4.5 E2E thủ công (người dùng chạy) — xem "E2E thủ công" bên dưới

## E2E thủ công (task 4.5)

1. Tạo nhóm "UGC ROAS 2.0" — nhập tên + mục tiêu + quy mô "3 tháng" + ngày kết
   thúc dự kiến + ngân sách 100.000.000 VND → lưu, mở lại thấy đủ trường.
2. Thử lưu nhóm không nhập mục tiêu → bị chặn "Cần nhập tên nhóm và mục tiêu".
3. Gán 2 dự án con vào nhóm → mở "Xem tổng hợp":
   - Khối "Thông tin nhóm" hiện mục tiêu / mô tả / quy mô / ngày kết thúc / ngân sách.
   - Chọn kỳ (tháng + ngày) → "Chi phí thực tế (tháng M/YYYY): …" khớp tổng 2 dự án.
   - "Đã dùng X% ngân sách (chi phí trong tháng M/YYYY)"; nếu vượt → dòng đỏ "vượt …".
   - "Tình trạng thời gian: Đang trong hạn — còn N ngày" (hoặc sắp hết hạn / quá hạn).
4. Sửa ngân sách sang USD → khối hiện 2 số riêng + ghi chú "khác đơn vị tiền tệ".
5. Mở một nhóm cũ (chưa có mục tiêu) → banner amber "chưa có mục tiêu"; mọi thao
   tác project-grouping (gán, kéo-thả, lưu trữ, xoá) vẫn chạy.
