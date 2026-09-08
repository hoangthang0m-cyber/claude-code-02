## 1. Data model (domain layer)

- [x] 1.1 Thêm enum vào `src/lib/domain/enums.ts`: `KNOWLEDGE_LIFECYCLES`
  (`active` | `archived`) + labels, `KNOWLEDGE_LINK_SECTIONS`
  (`detail` | `process` | `conclusion`) + labels, `KNOWLEDGE_PROJECT_REF_TYPES`
  (`project` | `project_group`) + labels. Verify: `src/lib/domain/domain.*` test
  mới khẳng định đúng bộ giá trị và thứ tự.
- [x] 1.2 Thêm `src/lib/domain/knowledge.ts`: interface `KnowledgeEntry`,
  `KnowledgeLink`(+`View`), `KnowledgeProjectRef`(+`View`); Zod
  `knowledgeEntryCreateSchema` (name + overview bắt buộc, `*_note` tuỳ chọn có
  giới hạn độ dài), `knowledgeEntryUpdateSchema` (`.partial()`, chặn rỗng
  name/overview), `knowledgeEntryLifecycleSchema`, `knowledgeEntryDeleteSchema`
  (`confirm_name`), `knowledgeLinkCreateSchema` / `…UpdateSchema` /
  `…ReorderSchema` (dùng `section` + URL http(s) + `label` bắt buộc),
  `knowledgeProjectRefCreateSchema` (`ref_type` + `ref_id`); helper
  `isKnowledgeEntryWritable`. Tái dùng `nextReferenceLinkSortIndex` /
  `reorderReferenceLinks` từ `@/lib/domain` cho `sort_index`. Verify: unit test
  mỗi schema nhận body hợp lệ và từ chối enum sai / thiếu trường bắt buộc / URL
  không http(s).
- [x] 1.3 Đăng ký `knowledgeEntries`, `knowledgeLinks`, `knowledgeProjectRefs`
  trong `src/lib/domain/collections.ts`; `export * from "@/lib/domain/knowledge"`
  trong `src/lib/domain/index.ts`. Verify: test khẳng định 3 khoá `COLLECTIONS`
  mới; `npm run typecheck` sạch.

## 2. API — tri thức (CRUD + lifecycle)

- [x] 2.1 `src/modules/knowledge/services/knowledge.server.ts`:
  `createKnowledgeEntry(actor, body)` — chỉ cần đăng nhập; set
  `lifecycle: "active"`, `created_by`/`created_at`, `updated_by`/`updated_at`.
  `POST /api/knowledge`. Verify: server test — staff tạo được; thiếu
  name/overview → 400.
- [x] 2.2 `updateKnowledgeEntry(actor, entryId, body)` — chỉ cần đăng nhập; 404
  nếu không có; 409 nếu `!isKnowledgeEntryWritable`; body rỗng → 400; ghi
  `updated_by`/`updated_at`. `PATCH /api/knowledge/[entryId]`. Verify: server
  test — sửa được; sửa entry archived → 409; xoá trắng name → 400.
- [x] 2.3 `setKnowledgeEntryLifecycle(actor, entryId, body)` —
  `requireSystemManager`; toggle `active` ⇄ `archived`; cùng trạng thái → 400.
  `POST /api/knowledge/[entryId]/lifecycle`. Verify: server test — staff → 403;
  manager lưu trữ rồi bỏ lưu trữ OK.
- [x] 2.4 `deleteKnowledgeEntry(actor, entryId, body)` — `requireSystemManager`;
  parse `knowledgeEntryDeleteSchema` và so `confirm_name` với `name` hiện tại
  (không khớp → 400); batch xoá mọi `knowledgeLinks` + `knowledgeProjectRefs`
  `where entry_id ==` rồi xoá entry; trả `{ links_removed, refs_removed }`.
  `DELETE /api/knowledge/[entryId]`. Verify: server test — staff → 403; sai tên →
  400; xoá đúng → entry + link + ref biến mất.
- [x] 2.5 `src/modules/knowledge/services/knowledge.client.ts` — wrapper
  `authedJson` cho các endpoint mục 2. Verify: `npm run typecheck` sạch.

## 3. API — link tài liệu theo đầu mục

- [x] 3.1 `addKnowledgeLink(actor, entryId, body)` — chỉ cần đăng nhập; 404 nếu
  entry không có, 409 nếu archived; parse `knowledgeLinkCreateSchema`;
  `sort_index = nextReferenceLinkSortIndex(các link cùng entry_id + section)`;
  trả `{ id, over_warn_limit }` (cờ khi > 20 trong cùng section).
  `POST /api/knowledge/[entryId]/links`. Verify: server test — thêm link Sheets
  có nhãn OK; thiếu nhãn → 400; URL `ftp://…` → 400; link thứ 21 trong 1 section
  → `over_warn_limit = true`.
- [x] 3.2 `updateKnowledgeLink` / `deleteKnowledgeLink(actor, linkId, …)` — chỉ
  cần đăng nhập; 404 nếu không có. `PATCH` / `DELETE /api/knowledge/links/[linkId]`.
  Verify: server test — staff sửa nhãn + gỡ được; gỡ không đụng link khác.
- [x] 3.3 `reorderKnowledgeLinks(actor, entryId, body)` — `ordered_ids` phải
  khớp đúng bộ id của (entry_id, section), sai → 400; `reorderReferenceLinks()`
  → batch update. `PUT /api/knowledge/[entryId]/links/reorder`. Verify: server
  test — đảo thứ tự ghi lại `sort_index`; bộ id lệch → 400.

## 4. API — tham chiếu Dự án / Nhóm dự án

- [x] 4.1 `addKnowledgeProjectRef(actor, entryId, body)` — chỉ cần đăng nhập; 404
  nếu entry không có, 409 nếu archived; parse `knowledgeProjectRefCreateSchema`;
  xác thực đích tồn tại: `ref_type === "project"` → `projects/{ref_id}` phải
  `exists`, `"project_group"` → `projectGroups/{ref_id}` phải `exists` (không có
  → 404); chụp `ref_name` từ `data().name`; `sort_index` như link.
  `POST /api/knowledge/[entryId]/refs`. Verify: server test — gắn 1 project + 1
  group OK, `ref_name` được lưu từ doc đích; `ref_id` không tồn tại → 404.
- [x] 4.2 `deleteKnowledgeProjectRef(actor, refId)` — chỉ cần đăng nhập; 404 nếu
  không có. `DELETE /api/knowledge/refs/[refId]`. Verify: server test — staff gỡ
  được; doc `projects`/`projectGroups` đích không bị đụng.

## 5. `firestore.rules`

- [x] 5.1 Thêm 3 block sau block `referenceLinks/`: `knowledgeEntries`,
  `knowledgeLinks`, `knowledgeProjectRefs` — `allow read: if isSignedIn();
  allow write: if false;`. Verify: `firestore.rules` test (nếu repo có bộ test
  rules) hoặc `npm run rules:deploy` chạy được; client `onSnapshot` đọc được,
  ghi trực tiếp bị chặn.

## 6. UI — danh sách tri thức

- [x] 6.1 `src/modules/knowledge/hooks/useKnowledgeEntries.ts` — `onSnapshot`
  `knowledgeEntries`; lọc `archived` trừ khi `includeArchived`; sắp `updated_at`
  giảm dần. Verify: trang danh sách hiển thị đúng entry hoạt động.
- [x] 6.2 `src/modules/knowledge/components/KnowledgeList.tsx` +
  `src/app/(dashboard)/knowledge/page.tsx` — tiêu đề + mô tả mục đích ngắn, nút
  "Tạo tri thức", ô tìm theo tên, toggle "Hiện đã lưu trữ", thẻ mỗi tri thức
  (tên + trích `overview` + "cập nhật lúc" + nhãn "Đã lưu trữ") link tới
  `/knowledge/{id}`; trạng thái rỗng có hướng dẫn. Verify: `npm run build` có
  route `/knowledge`; quan sát danh sách, tìm kiếm, lọc hoạt động.
- [x] 6.3 `src/modules/knowledge/components/KnowledgeEntryFormSheet.tsx` — Sheet
  tạo/sửa (mẫu `ProjectGroupFormSheet`): `name`, `overview`, `detail_note`,
  `process_note`, `conclusion_note`; gọi `knowledge.client`. Verify: tạo tri
  thức mới từ UI xuất hiện ngay trong danh sách (realtime).

## 7. UI — trang chi tiết

- [x] 7.1 `src/modules/knowledge/hooks/useKnowledgeEntry.ts` — `onSnapshot` doc
  entry + `knowledgeLinks where entry_id==` + `knowledgeProjectRefs where
  entry_id==`; gộp link theo `section`, sắp theo `sort_index`; trả `notFound`.
  Verify: mở `/knowledge/{id}` hiển thị đúng dữ liệu, cập nhật realtime.
- [x] 7.2 `src/modules/knowledge/components/KnowledgeLinksPanel.tsx` — phỏng theo
  `ReferenceLinksPanel`: list link của (entry, section), thêm/sửa/gỡ inline,
  lên/xuống gọi `reorder`, mở link tab mới, cảnh báo khi > 20. Verify: thêm link
  vào từng đầu mục 3/4/5, mở ra tab mới, sắp thứ tự giữ khi tải lại.
- [x] 7.3 `src/modules/knowledge/components/KnowledgeProjectRefPanel.tsx` +
  `KnowledgeProjectRefChip.tsx` — list thẻ tham chiếu (tên + loại, link tới
  `/campaigns/{id}` hoặc `/campaigns/groups/{id}`), nút "Gắn dự án / nhóm" mở ô
  chọn từ `useMyProjects()` / `useProjectGroups()`, gỡ thẻ. Verify: gắn 1 Dự án +
  1 Nhóm, bấm thẻ mở đúng trang; đổi tên dự án gốc → thẻ vẫn tên cũ.
- [x] 7.4 `src/app/(dashboard)/knowledge/[entryId]/page.tsx` +
  `KnowledgeEntryView.tsx` — render 5 đầu mục theo thứ tự; nút "Sửa" (mọi thành
  viên); với `profile.system_role === "manager"`: nút "Lưu trữ"/"Bỏ lưu trữ" và
  "Xoá" (xác nhận nhập lại tên). Entry `archived` → panel chỉ đọc, ẩn nút
  thêm/sửa. Verify: staff không thấy nút Xoá/Lưu trữ; manager thao tác được;
  entry archived ẩn nút sửa.

## 8. Điều hướng

- [x] 8.1 `src/components/common/AppSidebar.tsx` — thêm mục
  `{ title: "Tri thức", url: "/knowledge", icon: <NavIcon icon={…} /> }` vào
  `data.navMain` sau "Tài liệu". `src/components/common/SiteHeader.tsx` — thêm
  `"/knowledge": "Tri thức"` vào `PAGE_TITLES`. Verify: mục "Tri thức" hiện trên
  sidebar và mở đúng trang; tiêu đề header đúng.

## 9. Kiểm thử & xác minh tích hợp

- [x] 9.1 `src/lib/domain/knowledge.test.ts` — đăng ký collection + enum wiring +
  từng schema nhận/từ chối; `isKnowledgeEntryWritable`. Chạy `npm test` xanh.
- [x] 9.2 `src/modules/knowledge/services/knowledge.server.test.ts` — Firestore
  mock (mẫu header `referenceLinks.server.test.ts`): staff tạo/sửa OK; staff gọi
  DELETE / lifecycle → 403; manager làm được; sửa entry archived → 409; xoá sai
  `confirm_name` → 400; `addKnowledgeLink` gán `sort_index` tăng dần theo section
  + cờ > 20; reorder khớp bộ id; `addKnowledgeProjectRef` đích không tồn tại →
  404, đích OK lưu `ref_name`; URL không http(s) → 400.
- [x] 9.3 `src/modules/knowledge/services/knowledgeBase.integration.test.ts` —
  mock stateful: tạo entry → thêm link 3 section → gắn 1 project + 1 group → sửa
  note → staff không xoá được → manager lưu trữ (mutation vào entry → 409) →
  manager xoá (cascade sạch link + ref).
- [x] 9.4 Chạy `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` —
  tất cả sạch, toàn bộ suite cũ không hồi quy.
- [ ] 9.5 Kiểm thủ công end-to-end: sidebar có "Tri thức" → tạo tri thức đủ 5 đầu
  mục → thêm link vào đầu mục 3/4/5 và mở ra tab mới → đầu mục 4 gắn 1 Dự án + 1
  Nhóm dự án, bấm thẻ sang đúng `/campaigns/…` → đăng nhập nhân sự: sửa được,
  không thấy nút Xoá/Lưu trữ, gọi thẳng API DELETE → 403 → đăng nhập Trưởng
  phòng: Lưu trữ (trang chuyển chỉ đọc, ẩn khỏi danh sách mặc định) → Xoá (nhập
  lại tên) → tri thức + link + tham chiếu biến mất.
