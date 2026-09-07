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
- [ ] 2.3 Nhắc "bổ sung mục tiêu" trên trang tổng hợp cho nhóm cũ

### 3. Trang tổng hợp Nhóm
- [ ] 3.1 Khối "Thông tin nhóm" ở đầu trang
- [ ] 3.2 Chi phí thực tế = `report.total_spend` của khoảng đang xem
- [ ] 3.3 Đối chiếu ngân sách: % + cảnh báo vượt + số tiền vượt; ẩn khi chưa đặt
- [ ] 3.4 Khác đơn vị tiền tệ → 2 số riêng + ghi chú
- [ ] 3.5 Nhãn khoảng thời gian cạnh con số
- [ ] 3.6 Tình trạng thời gian computed từ `target_end_date`

### 4. Kiểm thử & xác minh tích hợp
- [ ] 4.1 Tạo/sửa: đủ trường, thiếu mục tiêu bị chặn, không ngày kết thúc, Nhân sự bị chặn
- [ ] 4.2 Nhóm cũ: mở được + nhắc; chức năng project-grouping không đổi
- [ ] 4.3 Đối chiếu ngân sách: trong/vượt/không đặt/khác đơn vị
- [ ] 4.4 Tình trạng thời gian: còn hạn / sắp hết hạn / quá hạn / không đặt
- [ ] 4.5 E2E thủ công (người dùng chạy)
