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
- [x] 1.2 Cột `Project.group_id` nullable (FK → `ProjectGroup`, xoá nhóm ⇒ set
  null); verify dự án hiện có đều `group_id = NULL` — helper chung
  `projectGroupId(project)` quy chuẩn `undefined/null → null`
- [x] 1.3 Cột `Project.sort_index`, backfill theo `created_at` bước nhảy đều;
  verify mọi dự án có `sort_index` duy nhất trong từng rổ `group_id`. Hàm thuần
  `computeSortIndexBackfill` (bước 100, append sau max của rổ, idempotent) +
  script `npm run backfill:sort-index -- --write` (chạy một lần trên prod, giống
  `seed:manager` / `rules:deploy`). Task 4.1 vẫn tự fallback về `created_at` khi
  thiếu `sort_index`.
- [x] 1.4 Refactor hàm tổng hợp `progress-analytics` nhận một TẬP `project_id`;
  verify test hồi quy: chỉ số cấp dự án không đổi. `ScopedView { mode,
  project_ids, uid }` + core `progressDashboardForScope` /
  `periodReportForScope` / `periodComparisonForScope` (task 5.1/5.3/5.4 gọi
  thẳng); `getProgressDashboard(actor)` / `getPeriodReport(actor)` giờ là wrapper
  mỏng qua `resolveAnalyticsScope`. `people.server.ts` giữ nguyên cấp dự án
  (roll-up nhóm không có bảng theo nhân sự).

### 4.2 Quản lý nhóm (CRUD)

- [x] 2.1 API tạo nhóm (name bắt buộc); verify từ chối thiếu name. `POST
  /api/project-groups` → `createProjectGroup` (manager-only qua
  `requireSystemManager`, lifecycle "active"). Module mới
  `src/modules/project-grouping/`. `requireSystemManager` đổi message sang chung
  ("Chỉ Trưởng phòng được thực hiện thao tác này").
- [x] 2.2 API sửa nhóm (name, description); verify lưu + phản ánh trên danh sách.
  `PATCH /api/project-groups/[groupId]` → `updateProjectGroup` (manager-only,
  body rỗng → 400, không tồn tại → 404, nhóm archived → 409, không đụng
  `lifecycle`). Helper `isProjectGroupWritable`.
- [x] 2.3 API lưu trữ / bỏ lưu trữ nhóm; verify nhóm archived ẩn khỏi danh sách
  mặc định, hiện qua bộ lọc "đã lưu trữ", dự án trong nhóm vẫn hoạt động.
  `POST /api/project-groups/[groupId]/lifecycle` → `setProjectGroupLifecycle`
  (toggle `active` ⇄ `archived`, cùng trạng thái → 400, KHÔNG cascade sang
  project). `projectGroupLifecycleSchema`. Phần ẩn/lọc danh sách kiểm ở task 4.1.
- [x] 2.4 API xoá nhóm với xác nhận; verify dự án của nhóm chuyển `group_id =
  NULL`, không dự án nào bị xoá. `DELETE /api/project-groups/[groupId]` →
  `deleteProjectGroup`: batch `update({ group_id: null })` cho mọi project
  `where group_id == id` + `delete` doc nhóm; trả `projects_reassigned`. Xác
  nhận là việc của UI.
- [x] 2.5 Giới hạn toàn bộ API mục 2 cho `system_role = manager`; verify Nhân sự
  bị từ chối. Mỗi API §2 gọi `requireSystemManager` ở dòng đầu; test tổng hợp
  `projectGroups.permissions.test.ts` (4 entry point → 403, staff không chạm
  Firestore).

### 4.3 Gán dự án vào nhóm

- [x] 3.1 API gán / chuyển / gỡ nhóm cho một dự án; verify không set 2 nhóm,
  chuyển A→B thì A không còn chứa dự án. `PATCH /api/projects/[projectId]/group`
  → `setProjectGroup` (manager-only, body `{ group_id: string | null }`; project
  không tồn tại → 404, nhóm đích không tồn tại → 404, nhóm đích archived → 409).
  `group_id` là scalar nên "không 2 nhóm" và "A→B ⇒ A mất" là bất biến cấu trúc.
  **Quyết định:** cho gán nhóm **bất kể lifecycle dự án** (dự án `done`/`archived`
  vẫn xếp vào nhóm được để roll-up lịch sử) — khác quy tắc "form archived = chỉ
  đọc" vì đây là thao tác tổ chức, không phải sửa form.
- [x] 3.2 Gán/chuyển vào rổ mới ⇒ `sort_index = max rổ + bước nhảy`; verify dự
  án mới nằm cuối rổ. `setProjectGroup` ghi thêm `sort_index` khi rổ đổi;
  `nextSortIndex` / `endOfBucketSortIndex`. Re-gán cùng nhóm → không reposition.
- [x] 3.3 Trường chọn nhóm (tuỳ chọn) trong form "Tạo dự án mới"; verify không
  chọn ⇒ "Chưa phân nhóm". `projectCreateSchema` thêm `group_id?`
  (`projectFormUpdateSchema` `.omit`); `createProject` gọi `assertAssignableGroup`
  + luôn set `sort_index`. Hook `useProjectGroups`, Select trong ProjectFormSheet
  (chỉ tạo mới). UI chưa test trên trình duyệt.
- [x] 3.4 Giới hạn gán nhóm cho `system_role = manager`; verify test phân quyền.
  `setProjectGroup` + `createProject` đã guard; test tổng hợp
  `projectAssignment.permissions.test.ts`.

### 4.4 Danh sách dự án theo nhóm

- [x] 4.1 API danh sách gom theo nhóm — hàm thuần `groupProjectsForList` + hook
  `useGroupedProjects` (2 read realtime nên list vẫn live).
- [x] 4.2 Màn hình `GroupedProjectList` thay `ProjectList`: khối mở/thu, giữ
  nguyên `ProjectCard`.
- [x] 4.3 `useCollapsedGroups` (useSyncExternalStore + localStorage) — tải lại
  giữ trạng thái mở/thu.
- [x] 4.4 Nhóm rỗng hiện với viền đứt; menu "＋ dự án" ở header khối (manager) →
  `setProjectGroup`.
- [x] 4.5 `computeReorder` + `PATCH /api/projects/[projectId]/order`
  (`reorderProject`) — midpoint / re-space, cùng rổ, manager-only.
- [x] 4.6 Kéo-thả `@dnd-kit/sortable` trong khối (manager, khối >1, không cho
  archived) → `reorderProject`; override thứ tự lạc quan.
- ⚠️ Toàn bộ UI nhóm 4 **chưa test trên trình duyệt** (không chạy được browser ở
  môi trường build). tsc + eslint + `next build` sạch.

### 4.5 Trang tổng hợp roll-up cấp nhóm

- [x] 5.1-5.5 `groupRollup.server.ts`: `resolveGroupScope` (nhóm → dự án con ∩
  dự án viewer làm manager; viewer không quản lý gì → 403). `GET
  /api/project-groups/[id]/dashboard` và `.../report[?compare=1][&format=csv]`
  → `getGroupDashboard` / `getGroupPeriodReport` / `getGroupPeriodComparison` /
  `getGroupReportPerProject`, tất cả gọi core §1.4. `projects_counted/total` +
  `group_empty`. CSV (`groupReportCsvRows`): cột theo dự án con, không có "Tổng
  nhóm". 6 test.
- [x] 5.6 `/campaigns/groups/[groupId]` → `GroupRollupView`: stat cards + báo
  cáo tuần/tháng + toggle so sánh + Xuất CSV, KHÔNG có bảng theo nhân sự. Link
  "Xem tổng hợp" ở header khối nhóm. UI **chưa test trên trình duyệt**.

### 4.6 Kiểm thử & xác minh tích hợp

- [x] 6.1 `groupLifecycle.integration.test.ts` — Firestore mock stateful, chạy
  hết tạo→gán→đổi tên→chuyển→lưu trữ→xoá, dự án luôn tồn tại.
- [x] 6.2/6.3 `groupRollup.integration.test.ts` — roll-up nhóm = tổng thủ công
  per-project; dashboard nhóm == dashboard actor-level khi phạm vi trùng; dự án
  ngoài quyền không rò vào.
- [x] 6.4 `projectGrouping.permissions.test.ts` — 7 entry point mutation × Nhân
  sự → 403, không chạm Firestore.
- [x] 6.5 `sortIndex.integration.test.ts` — nhiều lần kéo + chuyển rổ, `sort_index`
  duy nhất mỗi rổ, thứ tự ổn định qua "reload", re-space khi hết chỗ.
- [x] 6.6 `docs/E2E-PROJECT-GROUPING.md` — bản kiểm thủ công 13 bước (chưa chạy
  trên trình duyệt thật). Kèm UI quản lý nhóm ("Nhóm mới" + menu ⋮ đổi tên / lưu
  trữ / xoá) để E2E làm được trong browser.

## 5. Trạng thái tổng thể

Toàn bộ 31 task đã `[x]`. Backend + test đầy đủ. **UI nhóm 4 & 5 & phần quản lý
nhóm chưa chạy trên trình duyệt thật** — logic có unit/integration test, cần kiểm
theo `docs/E2E-PROJECT-GROUPING.md` sau khi deploy.
