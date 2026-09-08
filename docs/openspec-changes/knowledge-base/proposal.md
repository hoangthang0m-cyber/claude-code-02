## Why

Phòng marketing đang tích luỹ nhiều đúc kết và "công thức" vận hành (cách viết
content ra đơn, cách chạy ads hiệu quả, quy trình đã kiểm chứng) nhưng chúng nằm
rải rác trong chat, Google Docs/Sheets cá nhân và trí nhớ từng người. Không có
nơi tập trung để tra cứu, dùng lại bền vững, và để nhân sự mới tự học rồi tăng
hiệu quả nhanh. Cần một trang "Tri thức" trong app làm kho tri thức chính thức
của doanh nghiệp.

## What Changes

- Thêm **trang "Tri thức"** (`/knowledge`) trong khu vực dashboard, có mục riêng
  trên thanh điều hướng bên trái.
- Mỗi **tri thức** gồm 5 đầu mục:
  1. **Tên**
  2. **Mô tả tổng quan** — mục đích, bối cảnh áp dụng
  3. **Mô tả chi tiết** — văn bản tự do + đính nhiều link ngoài (Docs, Sheets,
     Drive, URL bất kỳ)
  4. **Quá trình đúc kết** — văn bản tự do + đính link ngoài **và/hoặc** tham
     chiếu tới **Dự án** / **Nhóm dự án** đã tạo ở trang `/campaigns`
  5. **Đúc kết** — văn bản tự do + đính link ngoài (Docx, Sheets…)
- **Danh sách + trang chi tiết**: `/knowledge` liệt kê các tri thức (tìm theo
  tên, có bộ lọc "đã lưu trữ"); mỗi tri thức mở ở trang riêng
  `/knowledge/{id}` hiển thị đủ 5 đầu mục.
- **Phân quyền**: mọi thành viên đăng nhập **xem, tạo, sửa** tri thức và
  đính/sửa/gỡ link + tham chiếu. **Chỉ Trưởng phòng** (`system_role = manager`)
  được **xoá** và **lưu trữ / bỏ lưu trữ** một tri thức.
- **Link chỉ để mở ra ngoài** — hệ thống không đọc nội dung, không đồng bộ (cùng
  nguyên tắc với capability `reference-links`).
- **Tham chiếu Dự án / Nhóm dự án** là lối tắt: lưu `ref_id` + ảnh chụp tên tại
  thời điểm gắn; bấm vào mở trang dự án/nhóm tương ứng. Không kéo số liệu, không
  đồng bộ tên.
- Tri thức đã **lưu trữ** ẩn khỏi danh sách mặc định và chuyển sang **chỉ đọc**
  (không xoá dữ liệu, giống lưu trữ Nhóm dự án).

## Capabilities

### New Capabilities

- `knowledge-base`: Trang "Tri thức" — kho đúc kết/công thức của doanh nghiệp.
  Mỗi tri thức gồm tên, mô tả tổng quan, mô tả chi tiết, quá trình đúc kết, đúc
  kết; đính link ngoài có nhãn theo từng đầu mục và tham chiếu Dự án/Nhóm dự án ở
  đầu mục "Quá trình đúc kết". Mọi thành viên xem/tạo/sửa; chỉ Trưởng phòng xoá
  và lưu trữ. Link chỉ mở ra ngoài, không đọc nội dung, không đồng bộ.

### Modified Capabilities

(không có — đây là trang độc lập, không đổi requirement của capability nào đang
có. `reference-links` giữ nguyên; `knowledge-base` dùng model link riêng để hai
tính năng độc lập, cùng lựa chọn với `document-library`.)

## Impact

- **Data model mới** (Firestore — không migration SQL; Zod schema +
  `firestore.rules` chính là schema):
  - `knowledgeEntries` — một document / tri thức (5 đầu mục, `lifecycle`
    active|archived, `created_by`/`created_at`, `updated_by`/`updated_at`).
  - `knowledgeLinks` — link có nhãn gắn vào một đầu mục
    (`section: detail | process | conclusion`) của một tri thức
    (`entry_id`, `url`, `label`, `note?`, `sort_index`).
  - `knowledgeProjectRefs` — tham chiếu Dự án/Nhóm dự án cho đầu mục "Quá trình
    đúc kết" (`entry_id`, `ref_type: project | project_group`, `ref_id`,
    `ref_name` snapshot, `sort_index`).
- **API mới**: route handlers dưới `src/app/api/knowledge/**` (CRUD tri thức,
  lifecycle, thêm/sửa/xoá/sắp thứ tự link, thêm/xoá tham chiếu). Mọi ghi qua
  `firebase-admin`; client chỉ đọc.
- **`firestore.rules`**: thêm 3 block cho 3 collection mới — `allow read: if
  isSignedIn()`, `allow write: if false`.
- **Giao diện**: `src/app/(dashboard)/knowledge/` (danh sách + `[entryId]`),
  module `src/modules/knowledge/`; thêm mục "Tri thức" vào
  `src/components/common/AppSidebar.tsx` và tiêu đề trong
  `src/components/common/SiteHeader.tsx`.
- **Không đụng**: Meta Ads, Google Sheets, `content-pipeline`,
  `project-grouping` (chỉ đọc `name` của Project/ProjectGroup cho ô chọn tham
  chiếu), `reference-links`, `document-library`.
- **Tái dùng**: pattern `reference-links` (đính link có nhãn, cảnh báo khi vượt
  20 link), helper `requireSystemManager`, hook `useMyProjects()` /
  `useProjectGroups()` cho ô chọn tham chiếu.
