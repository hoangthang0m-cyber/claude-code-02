# E2E thủ công — knowledge-base (task 9.5)

Bao phủ tự động: `knowledge.test.ts` (24 — schema + enum + `isKnowledgeEntryWritable`
+ `knowledgeRefHref`), `knowledge.server.test.ts` (19 — CRUD, 403/409/400/404,
`sort_index`/`over_warn_limit`, reorder, `ref_name` snapshot),
`knowledgeBase.integration.test.ts` (1 — dựng → tham chiếu → archive → delete
cascade). `typecheck` / `lint` / `build` sạch.

## Trước khi test

- Nhánh `feat/knowledge-base` merge vào `main` + deploy.
- `npm run rules:deploy` (3 block `knowledgeEntries` / `knowledgeLinks` /
  `knowledgeProjectRefs`).

## Các bước

1. Sidebar có mục **"Tri thức"** (icon bóng đèn) ngay sau "Tài liệu"; bấm mở
   `/knowledge`, tiêu đề header là "Tri thức".
2. **Tạo tri thức** → nhập Tên "Cách viết content ra đơn" + Mô tả tổng quan;
   để trống 3 đầu mục còn lại → Lưu. Hệ thống mở trang chi tiết
   `/knowledge/{id}`.
3. Trang chi tiết hiện **đúng 5 đầu mục theo thứ tự**: Tên, Mô tả tổng quan,
   Mô tả chi tiết, Quá trình đúc kết, Đúc kết. Đầu mục 3/4/5 có khu "Tài liệu
   đính kèm"; đầu mục 4 có thêm khu "Dự án / Nhóm dự án liên quan". Đầu mục
   trống hiện "(chưa nhập)", không lỗi.
4. Thử tạo tri thức bỏ trống Tên hoặc Mô tả tổng quan → toast "Cần nhập tên và
   mô tả tổng quan".
5. **Đính link** vào "Mô tả chi tiết": nhãn "Bảng số liệu gốc" + link Google
   Sheets → Thêm. Bấm tiêu đề link → mở **tab mới** (`rel="noopener noreferrer"`),
   hệ thống không nhúng / không đọc nội dung.
6. Thêm link vào cả "Quá trình đúc kết" và "Đúc kết". Sửa nhãn một link inline;
   dùng mũi tên ▲▼ đổi thứ tự → tải lại trang, thứ tự giữ nguyên. Gỡ một link →
   các link khác + nội dung tri thức không đổi.
7. Thêm > 20 link vào một đầu mục → hiện cảnh báo "đang có nhiều link…", vẫn cho
   thêm.
8. Thử dán `not a url` khi thêm link → API trả 400 "Link phải là URL bắt đầu
   bằng http:// hoặc https://".
9. **Gắn tham chiếu** ở "Quá trình đúc kết": bấm "Gắn Dự án / Nhóm" → chọn 1 Dự
   án + 1 Nhóm dự án từ danh sách. Hai thẻ hiện tên + loại. Bấm một thẻ → mở
   đúng `/campaigns/{id}` hoặc `/campaigns/groups/{id}`.
10. Vào trang Dự án gốc, **đổi tên** nó → quay lại trang tri thức: thẻ tham
    chiếu vẫn hiện **tên cũ** (ảnh chụp), không có thông báo nào. Link của thẻ
    vẫn mở đúng dự án.
11. **Đăng nhập bằng tài khoản Nhân sự** (`system_role = staff`):
    - Vẫn thấy nút "Sửa"; sửa nội dung / thêm link / gắn tham chiếu đều được.
    - **Không** thấy nút "Lưu trữ" và "Xoá".
    - Gọi thẳng `DELETE /api/knowledge/{id}` → 403.
12. **Đăng nhập bằng Trưởng phòng**:
    - "Lưu trữ" → tri thức biến khỏi danh sách mặc định `/knowledge`, hiện lại
      khi bật "Hiện đã lưu trữ" (có nhãn "Lưu trữ"); trang chi tiết ẩn nút
      Sửa / thêm link / gắn tham chiếu, có dòng "chỉ đọc".
    - "Bỏ lưu trữ" → sửa lại được.
    - "Xoá" → nhập lại **sai** tên: bị huỷ. Nhập đúng tên: tri thức + toàn bộ
      link + tham chiếu biến mất; quay về `/knowledge`.
13. Sửa nội dung Google Sheets/Docs đã đính → dữ liệu tri thức trên hệ thống
    không đổi, không có thông báo.
