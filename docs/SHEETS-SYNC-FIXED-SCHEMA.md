# Đồng bộ Google Sheets theo schema cố định — đặc tả + checklist

> Sửa lỗi "đồng bộ đọc 0 dòng". Nguồn: OpenSpec change `sheets-sync-fixed-schema`
> (`tasks-docs/openspec/changes/sheets-sync-fixed-schema/`). Thay bước **ánh xạ
> cột thủ công** của `sheets-sync` bằng **nhận diện cột theo bộ tên chuẩn**.

## Gốc lỗi

`readMappedSheet` cũ đọc range `A{header_row}:ZZ` và dùng `column_map` (ánh xạ tay
`{field: tên cột}`). Tên cột lệch một chút (dấu tiếng Việt, khoảng trắng, "Nhân
sự thực hiện" vs "Nhân sự") → không khớp → không có cột `Mã` → bỏ hết dòng → 0.

## Cách sửa (nhóm 2–3, đã làm)

- **`sheetSchema.ts`** — `normalizeHeader` (bỏ dấu NFD, thường hoá, gộp khoảng
  trắng) + `SHEET_COLUMN_ALIASES` (từ điển bí danh, gồm `ads_report_note` ↔ "báo
  cáo hiệu quả ads") + `recognizeColumns(header[])` → `{ field: colIndex }`, cột
  lạ bỏ qua, 2 cột cùng field → lấy trái nhất + cảnh báo.
- **`readMappedSheet` / `sheetPush` / `runFirstSheetSync`** giờ:
  - đọc **cả tab** (range `'tên tab'`), header = `values[header_row-1]`, data =
    `values[header_row..]` (sửa off-by-one),
  - bỏ các hàng **hoàn toàn rỗng** (kể cả hàng tiêu đề trang gộp ô phía trên),
  - nhận cột bằng `recognizeColumns`, KHÔNG dùng `column_map` nữa (`column_map`
    còn trên type tới khi migration nhóm 1 xoá hẳn).
  - không còn `Mã` → dừng chiều sheet→hệ thống, ghi lý do.
- **Số liệu Meta Ads không còn ghi xuống sheet** — schema chuẩn chỉ có một cột
  "Báo cáo hiệu quả ads" (ghi chú tự do → `ContentItem.ads_report_note`), tách
  biệt với `AdsMetric`.

## Checklist

### Nhóm 1 — Data model & dọn cấu hình cũ
- [ ] 1.1 `SheetSyncMapping.sheet_tab` bắt buộc, bỏ `column_map` (migration)
- [ ] 1.2 `ContentItem.ads_report_note` — **field đã thêm vào type** (nhóm 2.4);
  migration chính thức + xoá `column_map` để nhóm 1
- [ ] 1.3 bảng `SheetStatusAlias` + seed
- [ ] 1.4 `sheet_tab = NULL` → buộc chọn tab trước khi "đồng bộ ngay"

### Nhóm 2 — Nhận diện cột
- [x] 2.1 `normalizeHeader` (trim + lowercase + bỏ dấu NFD + gộp khoảng trắng)
- [x] 2.2 từ điển bí danh + `recognizeColumns` (cột lạ bỏ qua, 2 cột 1 field →
  trái nhất + cảnh báo), gồm `ads_report_note`
- [x] 2.3 thiếu cột `Mã` → dừng chiều sheet→hệ thống + ghi nhật ký, không tạo
  hạng mục nào
- [~] 2.4 đọc "Báo cáo hiệu quả ads" → `ads_report_note` (đã chảy qua
  `resolveField` dạng text). **Chưa có: màn hình hạng mục hiển thị tách biệt.**

### Nhóm 3 — Đọc dữ liệu từ tab
- [x] 3.1 đọc cả tab, header `values[N-1]`, data `values[N..]` (sửa off-by-one)
- [x] 3.2 bỏ hàng hoàn toàn rỗng ở mọi vị trí
- [~] 3.3 ô trong vùng gộp → nhận giá trị ở ô góc trên-trái, còn lại rỗng (mặc
  định của Sheets API, không đoán) — chưa có test riêng
- [x] 3.4 đối chiếu dòng ↔ hạng mục theo cột `Mã`

### Nhóm 4 — Tra cứu giá trị khi đọc
- [ ] 4.1 `Trạng thái` → enum qua `SheetStatusAlias`; không có → giữ + nhật ký
- [ ] 4.2 khớp `Nhân sự thực hiện` theo tên **chuẩn hoá** (hiện `.toLowerCase()`)
- [ ] 4.3 Deadline dd/mm/yyyy + yyyy-mm-dd (đã có `parseSheetDate`), + nhật ký
- [ ] 4.4 màn hình cấu hình bảng tra trạng thái

### Nhóm 5 — File Office & chọn tab
- [ ] 5.1 "Kiểm tra" gọi Drive `files.get` lấy mimeType; .xlsx → báo lỗi rõ
- [ ] 5.2 dropdown chọn tab
- [ ] 5.3 bỏ giao diện bảng ánh xạ cột

### Nhóm 6 — Sheet mẫu
- [ ] 6.1–6.4 nút "Tải sheet mẫu" tạo tab `Sync` + chép dữ liệu hiện có

### Nhóm 7 — Nhật ký đồng bộ
- [ ] 7.1 nhật ký ghi tab, số đọc/ghi, cột nhận diện được / không tìm thấy
- [ ] 7.2 mỗi dòng bỏ qua kèm lý do, gom theo lý do

### Nhóm 8 — Kiểm thử tích hợp
- [ ] 8.1–8.5
