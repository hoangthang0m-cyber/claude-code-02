# Nhóm dự án (Project Grouping) — đặc tả hợp nhất để triển khai

> Tính năng **bổ sung** cho `docs/SPEC.md`, KHÔNG sửa cấu trúc hay hành vi của
> Dự án đang chạy. Nguồn gốc: OpenSpec change `project-grouping` tại
> `tasks-docs/openspec/changes/project-grouping/` (proposal + design + spec +
> tasks). File này là bản dẫn xuất; mục 4 là checklist triển khai — làm tuần tự
> theo nhóm, mỗi task verify xong mới đánh `[x]`.
>
> Firestore không có migration SQL: các Zod schema + `firestore.rules` **là**
> schema. "Verify migration lên/xuống sạch" = schema nhận body hợp lệ, từ chối
> enum sai / thiếu trường bắt buộc; rollback = xoá file domain + entry
> `COLLECTIONS` + block rules, không có dữ liệu phải di trú.

---

## 1. Vì sao

Khi số dự án tăng, danh sách phẳng khó sắp xếp và khó truy vết — các chiến dịch
liên quan nhau (nhiều đợt UGC cùng định hướng "UGC ROAS 2.0") nằm rải rác. Cần
một lớp gom nhóm kiểu **thư mục** để tổ chức và xem tổng hợp theo nhóm.

## 2. Phạm vi

- **Nhóm dự án (ProjectGroup)** = thư mục thuần: chỉ tên + mô tả. KHÔNG có form
  mục tiêu / quy mô / link tiến độ / đúc kết như Dự án.
- Cấu trúc **một cấp**: Nhóm chứa Dự án; không có nhóm con.
- Mỗi Dự án thuộc **tối đa một Nhóm** (`group_id` nullable, không phải tag).
- Xoá nhóm không xoá dự án — dự án về "Chưa phân nhóm" (`group_id = NULL`).
- **Trang tổng hợp roll-up cấp nhóm**: dashboard + báo cáo tuần/tháng cộng dồn
  các dự án con — tái dùng nguyên chỉ số của `progress-analytics`, chỉ đổi phạm
  vi truy vấn.
- **Kéo-thả sắp thứ tự** dự án trong một khối (`sort_index`, dùng chung mọi
  người xem).

**Ngoài phạm vi:** nhóm lồng nhóm; một dự án thuộc nhiều nhóm; gom ở cấp hạng
mục nội dung; vai trò mới; đụng Google Sheets / Meta Ads API; di chuyển hàng
loạt hạng mục giữa dự án.

## 3. Quyết định kỹ thuật (design.md)

### 3.1 Data model — một bảng mới, hai cột nullable trên Project

```text
ProjectGroup (
  id, name, description nullable,
  lifecycle: active | archived,
  created_by, created_at
)

Project (
  ... giữ nguyên toàn bộ trường hiện có ...,
  group_id nullable,   -- FK -> ProjectGroup.id, "ON DELETE SET NULL":
                       --   xoá nhóm -> mọi Project.group_id của nhóm về null
  sort_index           -- thứ tự thủ công trong "rổ" của nó (một group_id cụ
                       --   thể, hoặc rổ group_id = null)
)
```

- `group_id = NULL` nghĩa là "Chưa phân nhóm". Không dùng bảng nối (không phải
  quan hệ nhiều-nhiều).
- KHÔNG có `parent_group_id` (đã chốt một cấp).
- `ProjectGroup` cố tình thiếu `objective` / `scale` / `progress_sheet_url` /
  `retrospective` để không mở ra khả năng "nhóm cũng là dự án".

### 3.2 Roll-up = đổi phạm vi, không đổi công thức

Các hàm tổng hợp của `progress-analytics` được refactor để nhận **một tập
`project_id`** thay vì một giá trị:

- Cấp dự án: tập = `{project_id}` (một phần tử) — chỉ số **không đổi**.
- Cấp nhóm: tập = các `Project.group_id == :group_id` ∩ quyền người xem.

Trang tổng hợp cấp nhóm **KHÔNG có** bảng "khối lượng theo nhân sự" (chốt với
người dùng) — chỉ stat cards + báo cáo tuần/tháng + so sánh kỳ.

### 3.3 Phân quyền

- Tạo / sửa / xoá / lưu trữ nhóm và gán dự án vào nhóm: chỉ `system_role =
  manager`. Dùng lại `requireSystemManager`.
- Roll-up cấp nhóm chỉ tính + hiển thị các dự án con người xem có quyền xem (qua
  `ProjectMember` role manager); nhóm chứa dự án ngoài quyền → loại khỏi phép
  tính + hiện "đang tính N/M dự án".
- Không thêm khái niệm "người sở hữu nhóm" — mọi Trưởng phòng thao tác được trên
  mọi nhóm.

### 3.4 Thứ tự — `sort_index` có khoảng cách

- `sort_index` (số, bước nhảy đều 100/200/300…) tính **trong phạm vi một rổ**
  (`group_id` cụ thể, và riêng rổ `group_id IS NULL`).
- Kéo-thả trong cùng rổ → chèn giá trị giữa hai lân cận; reindex cả rổ khi hết
  khoảng trống.
- Gán / chuyển dự án sang nhóm khác → đặt xuống **cuối** rổ mới (`max + bước
  nhảy`).
- Thứ tự dùng chung cho mọi người xem, không phải sắp xếp cá nhân.

### 3.5 Màn hình danh sách & xuất báo cáo

- Danh sách dự án đổi thành **gom theo nhóm** + khối "Chưa phân nhóm". Trạng
  thái mở/thu từng nhóm lưu ở client (localStorage).
- Giữ nguyên component thẻ dự án — chỉ bọc thêm lớp nhóm.
- Xuất báo cáo nhóm: cột **tách theo từng dự án con**, KHÔNG có hàng/sheet "tổng
  hợp toàn nhóm".

### 3.6 Migration / rollback

1. Thêm collection `projectGroups` + cột `Project.group_id` (mặc định `NULL`) +
   cột `Project.sort_index` (backfill theo `created_at`, bước nhảy đều).
2. Không cần backfill dữ liệu khác — mọi dự án hiện có mặc định "Chưa phân nhóm",
   hiện y như trước trong khối "Chưa phân nhóm".
3. Rollback: bỏ `group_id`, `sort_index`, collection `projectGroups`; danh sách
   quay lại phẳng. Không mất dữ liệu dự án.

---

## 4. Checklist triển khai

### 4.1 Data model & nền tảng

- [x] 1.1 Bảng `ProjectGroup` (id, name, description nullable, lifecycle
  active|archived, created_by, created_at); verify schema nhận body hợp lệ / từ
  chối enum sai + thiếu name, rollback sạch
- [ ] 1.2 Cột `Project.group_id` nullable (FK → `ProjectGroup`, xoá nhóm ⇒ set
  null); verify dự án hiện có đều `group_id = NULL`
- [ ] 1.3 Cột `Project.sort_index`, backfill theo `created_at` bước nhảy đều;
  verify mọi dự án có `sort_index` duy nhất trong từng rổ `group_id`
- [ ] 1.4 Refactor hàm tổng hợp `progress-analytics` nhận một TẬP `project_id`;
  verify test hồi quy: chỉ số cấp dự án không đổi

### 4.2 Quản lý nhóm (CRUD)

- [ ] 2.1 API tạo nhóm (name bắt buộc); verify từ chối thiếu name
- [ ] 2.2 API sửa nhóm (name, description); verify lưu + phản ánh trên danh sách
- [ ] 2.3 API lưu trữ / bỏ lưu trữ nhóm; verify nhóm archived ẩn khỏi danh sách
  mặc định, hiện qua bộ lọc "đã lưu trữ", dự án trong nhóm vẫn hoạt động
- [ ] 2.4 API xoá nhóm với xác nhận; verify dự án của nhóm chuyển `group_id =
  NULL`, không dự án nào bị xoá
- [ ] 2.5 Giới hạn toàn bộ API mục 2 cho `system_role = manager`; verify Nhân sự
  bị từ chối

### 4.3 Gán dự án vào nhóm

- [ ] 3.1 API gán / chuyển / gỡ nhóm cho một dự án; verify không set 2 nhóm,
  chuyển A→B thì A không còn chứa dự án
- [ ] 3.2 Gán/chuyển vào rổ mới ⇒ `sort_index = max rổ + bước nhảy`; verify dự
  án mới nằm cuối rổ
- [ ] 3.3 Trường chọn nhóm (tuỳ chọn) trong form "Tạo dự án mới"; verify không
  chọn ⇒ "Chưa phân nhóm"
- [ ] 3.4 Giới hạn gán nhóm cho `system_role = manager`; verify test phân quyền

### 4.4 Danh sách dự án theo nhóm

- [ ] 4.1 API danh sách gom theo nhóm + khối "Chưa phân nhóm", mỗi nhóm kèm số
  lượng, dự án sắp theo `sort_index` tăng dần; verify cấu trúc + thứ tự
- [ ] 4.2 Màn hình danh sách: bọc thẻ dự án trong khối nhóm mở/thu, giữ nguyên
  component thẻ; verify dự án chưa phân nhóm hiển thị y như trước
- [ ] 4.3 Lưu trạng thái mở/thu từng nhóm ở client (localStorage); verify tải
  lại giữ nguyên
- [ ] 4.4 Nhóm rỗng vẫn hiển thị (số lượng 0 + nút gán dự án); verify quan sát
- [ ] 4.5 API cập nhật thứ tự (chèn giữa hai lân cận, reindex khi hết chỗ);
  verify thứ tự đúng sau nhiều lần kéo
- [ ] 4.6 UI kéo-thả trong một khối (chỉ manager); verify lưu ở server, người
  khác tải lại thấy thứ tự mới, kéo nhóm A không ảnh hưởng nhóm B / "Chưa phân
  nhóm"

### 4.5 Trang tổng hợp roll-up cấp nhóm

- [ ] 5.1 API dashboard cấp nhóm (nhận `group_id`, tập dự án con ∩ quyền, gọi
  hàm 1.4); verify chỉ số cộng dồn khớp tổng thủ công
- [ ] 5.2 Loại dự án ngoài quyền + trả "đang tính N/M dự án"; verify test
- [ ] 5.3 API báo cáo tuần/tháng cấp nhóm; verify nhóm rỗng ⇒ 0 + nhãn "nhóm
  chưa có dự án"
- [ ] 5.4 API so sánh kỳ cấp nhóm; verify test hai kỳ có dữ liệu
- [ ] 5.5 Xuất báo cáo nhóm ra CSV: cột tách theo từng dự án con, không có "tổng
  hợp toàn nhóm"; verify cấu trúc tệp
- [ ] 5.6 Màn hình trang tổng hợp nhóm (stat cards + báo cáo + toggle so sánh +
  nút xuất, KHÔNG có bảng theo nhân sự); verify điều hướng từ khối nhóm

### 4.6 Kiểm thử & xác minh tích hợp

- [ ] 6.1 Test vòng đời nhóm: tạo → gán → chuyển → lưu trữ → xoá; dự án không
  bao giờ bị mất
- [ ] 6.2 Test hồi quy `progress-analytics` cấp dự án sau refactor 1.4
- [ ] 6.3 Test roll-up khớp tổng thủ công, kể cả khi có dự án ngoài quyền
- [ ] 6.4 Test phân quyền: Nhân sự không tạo/sửa/xoá/lưu trữ nhóm, không gán, không kéo-thả
- [ ] 6.5 Test thứ tự: kéo nhiều lần, chuyển rổ, `sort_index` không trùng, ổn định qua nhiều phiên
- [ ] 6.6 Kiểm tra thủ công end-to-end: nhóm "UGC ROAS 2.0" → gán 2 dự án → kéo
  sắp thứ tự → danh sách gom đúng → trang tổng hợp nhóm xem dashboard + báo cáo tháng
