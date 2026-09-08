## 1. Data model & API

- [x] 1.1 Migration tạo `OrgDocument` (category, title, url, doc_date nullable, note nullable, created_by/at, updated_by/at); verify migration lên/xuống sạch
- [x] 1.2 API tạo mục (category + title + url bắt buộc; doc_date, note tuỳ chọn); từ chối khi thiếu title/url; kiểm tra URL có scheme http/https; verify
- [ ] 1.3 API sửa mục (title, url, doc_date, note) và xoá mục; ghi `updated_by`/`updated_at`; verify mọi thành viên đã đăng nhập làm được, người chưa đăng nhập bị chặn
- [ ] 1.4 API liệt kê theo `category` + tìm theo tiêu đề (khớp một phần) + sắp xếp (doc_date giảm dần mặc định, hoặc updated_at); mục không có doc_date xếp cuối khi sắp theo ngày; verify

## 2. Trang Tài liệu

- [ ] 2.1 Route/menu "Tài liệu" mở trang hai phần: "Biên bản họp" và "Tài liệu tổ chức"; verify điều hướng, hai kho tách biệt
- [ ] 2.2 Mỗi phần: danh sách mục (tiêu đề mở tab mới với rel="noopener noreferrer", ngày, ghi chú), nút Thêm, sửa/xoá inline; verify
- [ ] 2.3 Form thêm/sửa (tiêu đề, link, ngày tuỳ chọn, ghi chú tuỳ chọn); báo lỗi khi thiếu tiêu đề/link; verify
- [ ] 2.4 Ô tìm theo tiêu đề + chọn sắp xếp cho từng kho; verify lọc và sắp đúng
- [ ] 2.5 Trạng thái rỗng ("chưa có biên bản/tài liệu nào") + nút thêm; verify

## 3. Kiểm thử

- [ ] 3.1 Test API: thiếu title/url bị từ chối, URL không hợp lệ bị từ chối, thêm/sửa/xoá thành công, liệt kê đúng category
- [ ] 3.2 Test quyền: người chưa đăng nhập không mở được; mọi thành viên (staff và manager) thêm/sửa/xoá được
- [ ] 3.3 Test tìm & sắp xếp: khớp một phần tiêu đề; sắp theo ngày (mục không ngày xếp cuối) và theo cập nhật gần nhất
- [ ] 3.4 Kiểm tra thủ công end-to-end: thêm 1 biên bản họp (link Docs) + 1 tài liệu tổ chức (link Sheets) → mở link ra tab mới → sửa tiêu đề → xoá → tìm theo tiêu đề
