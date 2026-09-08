# E2E thủ công — document-library (task 3.4)

Bao phủ tự động: `domain.orgDocument.test.ts` (schema + `filterAndSortOrgDocuments`),
`orgDocuments.server.test.ts` (create/update/delete/list, thiếu title/url → 400,
URL không http(s) → 400, sai category → 400, tìm & sắp xếp, staff + manager CRUD
như nhau, sửa/xoá mục của người khác được).

## Trước khi test

- Nhánh `feat/document-library` merge vào `main` + deploy.
- `firestore.rules` publish (block `match /orgDocuments/{docId}` mới —
  `read: if isSignedIn()`, `write: if false`).

## Các bước

1. Đăng nhập, bấm menu **Tài liệu** → trang có 2 tab: **Biên bản họp** /
   **Tài liệu tổ chức**, tách biệt.
2. Tab "Biên bản họp" → **Thêm**: tiêu đề "Họp kế hoạch tháng 9", dán link Google
   Docs, chọn ngày họp → **Lưu**. Mục hiện trong danh sách.
3. Thử **Thêm** mà bỏ trống tiêu đề → toast "Cần nhập tiêu đề". Bỏ trống link →
   "Cần nhập link". Dán `not a url` → API trả 400 "Link phải là URL bắt đầu
   bằng http:// hoặc https://".
4. Bấm tiêu đề → mở link trong **tab mới** (`rel="noopener noreferrer"`), hệ
   thống không nhúng / không đọc nội dung.
5. Tab "Tài liệu tổ chức" → **Thêm** "Quy chế lương thưởng video" + link Sheets.
   Mục này chỉ hiện ở tab "Tài liệu tổ chức", không lẫn sang "Biên bản họp".
6. **Sửa** một mục (bút chì) → đổi tiêu đề → **Lưu**. **Xoá** một mục (thùng rác)
   → xác nhận → mục biến mất, các mục khác giữ nguyên.
7. Gõ "tháng 9" vào ô tìm → chỉ còn mục có tiêu đề chứa "tháng 9".
8. Đổi sắp xếp "Theo ngày" ↔ "Cập nhật gần nhất" → thứ tự đổi đúng; mục không có
   ngày xếp cuối khi sắp theo ngày.
9. Đăng nhập bằng tài khoản **staff** (không phải trưởng phòng) → vẫn thêm / sửa /
   xoá được ở cả hai kho.
10. Sửa nội dung trong Google Sheets/Docs đã đính → dữ liệu trên hệ thống không
    đổi, không có thông báo nào.
11. Mở `/documents` khi **chưa đăng nhập** (tab ẩn danh) → bị chuyển về trang
    đăng nhập.
