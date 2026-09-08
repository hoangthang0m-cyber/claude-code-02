## Why

Phòng marketing cần một nơi tập trung để lưu biên bản họp và các tài liệu/văn bản của tổ chức, hiện đang rải rác trong chat và ổ cá nhân. Chỉ cần đính link (Google Sheets, Docs, Drive, hoặc URL bất kỳ) — không cần lưu file, không cần đồng bộ.

## What Changes

- Thêm **trang "Tài liệu"** với hai kho:
  1. **Kho biên bản họp**: danh sách biên bản, mỗi mục gồm tiêu đề, ngày họp (tuỳ chọn), link (Sheets/Docs/…), ghi chú ngắn (tuỳ chọn). Không gắn với tính năng "Cuộc họp" — chỉ là danh sách link rời.
  2. **Kho tài liệu tổ chức khác**: danh sách tài liệu, mỗi mục gồm tiêu đề, ngày (tuỳ chọn), link ngoài, ghi chú (tuỳ chọn).
- Link chỉ để **mở trong tab mới** — hệ thống không đọc nội dung, không đồng bộ.
- **Mọi thành viên** xem, thêm, sửa, xoá.
- Tìm theo tiêu đề, sắp xếp theo ngày hoặc lần cập nhật gần nhất.

## Capabilities

### New Capabilities

- `document-library`: Trang "Tài liệu" gồm hai kho link — biên bản họp và tài liệu tổ chức — với thêm/sửa/xoá bởi mọi thành viên, tìm và sắp xếp; link chỉ mở ra ngoài, không đọc nội dung, không đồng bộ.

### Modified Capabilities

(không có — đây là trang độc lập, không đụng capability nào đang có.)

## Impact

- Data model mới: một bảng `OrgDocument` (phân biệt hai kho bằng trường `category`). Không bảng nào khác bị đụng.
- Giao diện: dùng lại mục "Tài liệu" đã có ở menu; trang có hai phần/tab cho hai kho.
- Song song về ý tưởng với `reference-links` (đính link vào dự án/hạng mục của `campaign-page-reference-links`) nhưng phạm vi khác: `document-library` là kho cấp tổ chức, trang riêng, không gắn dự án. Dùng model riêng để giữ hai tính năng độc lập.
- Không đụng Meta Ads, Google Sheets sync, `content-pipeline`, `project-grouping`.
