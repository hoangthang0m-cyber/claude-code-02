## Context

Xem `proposal.md`. Tính năng nhỏ, độc lập: một trang "Tài liệu" (mục menu đã có) với hai kho link. App: Next.js + Firebase (repo `claude-code-02-main`). Người dùng đã chốt: biên bản họp **không** gắn với tính năng "Cuộc họp"; **mọi thành viên** thêm/sửa/xoá.

## Goals / Non-Goals

**Goals:**

- Một model duy nhất cho cả hai kho, phân biệt bằng `category`.
- Thêm/sửa/xoá/tìm/sắp xếp — không gì hơn.

**Non-Goals:**

- Không lưu file (chỉ link).
- Không đọc/parse/đồng bộ nội dung link.
- Không gắn với "Cuộc họp", dự án, hay hạng mục.
- Không phân quyền theo vai (mọi thành viên như nhau).
- Không phân cấp thư mục / tag ở phiên bản này (chỉ hai kho phẳng).

## Decisions

### 1. Data model

```text
OrgDocument (
  id,
  category: 'meeting_minutes' | 'org_document',
  title,               -- bắt buộc
  url,                 -- bắt buộc
  doc_date  date null, -- ngày họp (biên bản) hoặc ngày tài liệu
  note      text null,
  created_by, created_at, updated_by, updated_at
)
```

Một bảng, lọc theo `category` cho từng kho. Firestore: collection `orgDocuments` với field `category`. Không cần `sort_index` — sắp xếp theo `doc_date` / `updated_at` khi đọc.

### 2. Trang

- Dùng lại route/menu "Tài liệu" đã có.
- Hai phần (tab hoặc hai khối cuộn): "Biên bản họp" và "Tài liệu tổ chức".
- Mỗi phần: ô tìm theo tiêu đề, chọn sắp xếp (ngày ↓ mặc định / cập nhật gần nhất), danh sách mục (tiêu đề là link mở tab mới, ngày, ghi chú, nút sửa/xoá), nút "Thêm".
- Form thêm/sửa: tiêu đề, link, ngày (tuỳ chọn), ghi chú (tuỳ chọn).

### 3. Quyền

- Yêu cầu đăng nhập.
- Mọi thành viên đã đăng nhập: xem + thêm + sửa + xoá cả hai kho.
- Ghi `created_by` / `updated_by` để có dấu vết, nhưng không dùng để chặn thao tác.

### 4. Xác thực link

- Chỉ kiểm tra định dạng URL (có scheme http/https) khi thêm/sửa. Không gọi mạng, không phân loại nhà cung cấp.
- Hiển thị link: mở `target="_blank"` + `rel="noopener noreferrer"`.

## Risks / Trade-offs

- **[Trade-off]** Mọi thành viên xoá được → có thể xoá nhầm. Chấp nhận cho kho nội bộ nhỏ; `updated_by`/`created_by` giúp truy vết. Nếu sau này cần, thêm "thùng rác" hoặc giới hạn xoá.
- **[Trade-off]** Hai kho phẳng, không tag/thư mục → khi tài liệu nhiều sẽ khó tìm. Ô tìm theo tiêu đề đủ cho giai đoạn đầu.

## Migration Plan

1. Tạo bảng/collection `OrgDocument`.
2. Thêm trang hai kho vào route "Tài liệu".

Rollback: ẩn trang, bỏ bảng. Không ảnh hưởng dữ liệu khác.

## Open Questions

(không — phạm vi đã rõ.)
