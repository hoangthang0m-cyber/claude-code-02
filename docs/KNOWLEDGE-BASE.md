# Knowledge Base — trang "Tri thức"

Nguồn sự thật: OpenSpec change `knowledge-base`
(`docs/openspec-changes/knowledge-base/`). File này là bản làm việc trong repo +
checklist. Nếu code hiện tại mâu thuẫn với change → báo, không tự quyết.

Kho tri thức doanh nghiệp: mỗi tri thức gồm **5 đầu mục cố định** — (1) Tên,
(2) Mô tả tổng quan, (3) Mô tả chi tiết, (4) Quá trình đúc kết, (5) Đúc kết.
Đầu mục 3/4/5 đính được nhiều **link ngoài** có nhãn; đầu mục 4 còn gắn được
**tham chiếu Dự án / Nhóm dự án**. Hệ thống chỉ lưu và mở link — không đọc nội
dung, không đồng bộ (cùng nguyên tắc `reference-links`).

## Data model — 3 collection, tách hẳn `reference-links`

| Collection | Việc |
|---|---|
| `knowledgeEntries` | 1 doc / tri thức: `name`, `overview`, `detail_note?`, `process_note?`, `conclusion_note?`, `lifecycle: active\|archived`, `created_by/at`, `updated_by/at` |
| `knowledgeLinks` | link có nhãn của 1 đầu mục: `entry_id`, `section: detail\|process\|conclusion`, `url`, `label`, `note?`, `sort_index` |
| `knowledgeProjectRefs` | tham chiếu ở "Quá trình đúc kết": `entry_id`, `ref_type: project\|project_group`, `ref_id`, `ref_name` (ảnh chụp lúc gắn), `note?`, `sort_index` |

`sort_index` tái dùng `nextReferenceLinkSortIndex` / `reorderReferenceLinks` từ
`@/lib/domain`. `ref_name` **không tin** từ body — server đọc từ `projects/{id}`
/ `projectGroups/{id}`.

## Phân quyền

| Thao tác | Quyền |
|---|---|
| Xem tri thức + link + tham chiếu | mọi user đăng nhập (`firestore.rules`) |
| Tạo / sửa tri thức; thêm/sửa/gỡ/sắp link; gắn/gỡ tham chiếu | mọi user đăng nhập (`getAuthedUser`) |
| Xoá (nhập lại đúng tên); lưu trữ / bỏ lưu trữ | `system_role = manager` (`requireSystemManager`) |

Tri thức `archived` → chỉ đọc: mọi mutation nội dung/link/ref vào nó trả **409**.

## API — `src/app/api/knowledge/**`

| Route | Method | Việc | Quyền |
|---|---|---|---|
| `/api/knowledge` | POST | tạo | thành viên |
| `/api/knowledge/[entryId]` | PATCH / DELETE | sửa / xoá (cascade) | sửa: thành viên · xoá: manager |
| `/api/knowledge/[entryId]/lifecycle` | POST | lưu trữ / bỏ lưu trữ | manager |
| `/api/knowledge/[entryId]/links` | POST | thêm link vào 1 section | thành viên |
| `/api/knowledge/[entryId]/links/reorder` | PUT | sắp thứ tự link 1 section | thành viên |
| `/api/knowledge/links/[linkId]` | PATCH / DELETE | sửa / gỡ link | thành viên |
| `/api/knowledge/[entryId]/refs` | POST | gắn tham chiếu | thành viên |
| `/api/knowledge/refs/[refId]` | DELETE | gỡ tham chiếu | thành viên |

Đọc danh sách/chi tiết **không** qua API — client `onSnapshot` trực tiếp
(`useKnowledgeEntries`, `useKnowledgeEntry`).

## Checklist

### 1. Data model
- [x] 1.1 enum `KNOWLEDGE_LIFECYCLES` / `_LINK_SECTIONS` / `_PROJECT_REF_TYPES` + labels
- [x] 1.2 `src/lib/domain/knowledge.ts`: interface + View + Zod schema + `isKnowledgeEntryWritable` + `knowledgeRefHref`
- [x] 1.3 đăng ký 3 collection + export barrel (24 unit test)

### 2. API tri thức
- [x] 2.1 `createKnowledgeEntry` + `POST /api/knowledge`
- [x] 2.2 `updateKnowledgeEntry` (409 archived / 400 empty / 404) + `PATCH`
- [x] 2.3 `setKnowledgeEntryLifecycle` (manager) + `POST .../lifecycle`
- [x] 2.4 `deleteKnowledgeEntry` cascade (manager, confirm_name) + `DELETE`
- [x] 2.5 `knowledge.client.ts` wrapper

### 3. API link theo đầu mục
- [x] 3.1 `addKnowledgeLink` (sort_index/section, over_warn_limit > 20) + `POST .../links`
- [x] 3.2 `updateKnowledgeLink` / `deleteKnowledgeLink` + `PATCH/DELETE .../links/[linkId]`
- [x] 3.3 `reorderKnowledgeLinks` (đúng bộ id/section) + `PUT .../links/reorder`

### 4. API tham chiếu Dự án / Nhóm
- [x] 4.1 `addKnowledgeProjectRef` (target phải tồn tại, snapshot `ref_name`) + `POST .../refs`
- [x] 4.2 `deleteKnowledgeProjectRef` + `DELETE .../refs/[refId]`

### 5. firestore.rules
- [x] 5.1 3 block `knowledgeEntries` / `knowledgeLinks` / `knowledgeProjectRefs` — `read: if isSignedIn()`, `write: if false`. Deploy: `npm run rules:deploy`.

### 6. UI danh sách
- [x] 6.1 `useKnowledgeEntries` (onSnapshot, lọc archived, sort `updated_at` desc)
- [x] 6.2 `KnowledgeList` + `/knowledge/page.tsx` + `loading.tsx` (tìm theo tên, toggle "Hiện đã lưu trữ", thẻ + trạng thái rỗng)
- [x] 6.3 `KnowledgeEntryFormSheet` (tạo/sửa 5 đầu mục)

### 7. UI chi tiết
- [x] 7.1 `useKnowledgeEntry` (onSnapshot entry + links gộp theo section + refs)
- [x] 7.2 `KnowledgeLinksPanel` (phỏng `ReferenceLinksPanel`: thêm/sửa/gỡ/lên-xuống, mở tab mới `rel="noopener noreferrer"`, cảnh báo > 20)
- [x] 7.3 `KnowledgeProjectRefPanel` + `KnowledgeProjectRefChip` (thẻ link `/campaigns/{id|groups/id}`, ô chọn từ `useMyProjects` + `useProjectGroups`)
- [x] 7.4 `KnowledgeEntryView` + `/knowledge/[entryId]/page.tsx` (5 panel; "Sửa" cho thành viên; "Lưu trữ"/"Xoá" chỉ manager; archived → panel chỉ đọc)

### 8. Điều hướng
- [x] 8.1 `AppSidebar.tsx` thêm "Tri thức" (icon bóng đèn) sau "Tài liệu"; `SiteHeader.tsx` thêm `"/knowledge": "Tri thức"`

### 9. Kiểm thử
- [x] 9.1 `src/lib/domain/knowledge.test.ts` (24 test)
- [x] 9.2 `knowledge.server.test.ts` (19 test — staff/manager, 403/409/400/404, sort_index, reorder, ref snapshot)
- [x] 9.3 `knowledgeBase.integration.test.ts` (1 test — dựng → tham chiếu → archive → delete cascade)
- [x] 9.4 `typecheck` + `lint` + `test` (1033 xanh) + `build` (`/knowledge`, `/knowledge/[entryId]`, 8 route API) sạch
- [ ] 9.5 E2E thủ công — `docs/E2E-KNOWLEDGE-BASE.md`

## Deploy — người dùng chạy

- `npm run rules:deploy` — publish 3 block `firestore.rules` mới. (Không bắt buộc
  để tính năng chạy: mọi đọc qua `onSnapshot` cần rule `read`, nên **nên deploy**.)
- Không có migration dữ liệu.
