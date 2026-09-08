## Context

Xem `proposal.md` cho lý do. Ràng buộc từ codebase `claude-code-02-main`
(Next.js 16 App Router + Firebase):

- **Không có migration SQL.** Firestore schemaless: các Zod write-schema trong
  `src/lib/domain/` + `firestore.rules` chính là schema. Collection xuất hiện khi
  có document đầu tiên, biến mất khi document cuối bị xoá.
- **Client chỉ đọc.** Mọi ghi vào collection nghiệp vụ đi qua route handler
  `src/app/api/**` dùng `firebase-admin`; `firestore.rules` để `allow write: if
  false` cho các collection đó.
- **Phân quyền** có hai tầng: `system_role` (`manager` | `staff`, toàn cục, đọc
  từ `users/{uid}`) và `project_role` (theo từng dự án). Helper
  `requireSystemManager(actor)` đã có trong `src/lib/permissions/projectScope.ts`.
- **Đã có capability `reference-links`** (change `campaign-page-reference-links`):
  đính link có nhãn vào một dự án / hạng mục, "hệ thống chỉ lưu và mở link, không
  đọc nội dung, không đồng bộ", cảnh báo khi > 20 link, có `sort_index` để kéo
  sắp thứ tự. Các helper thuần `nextReferenceLinkSortIndex(existing[])` và
  `reorderReferenceLinks(orderedIds[])` được export từ `@/lib/domain`.
- **Đang làm dở capability `document-library`** ("Tài liệu"): trang độc lập với
  model `OrgDocument` riêng, "mọi thành viên" CRUD — chọn model riêng thay vì
  dùng chung `reference-links` "để giữ hai tính năng độc lập".
- **Trang `/campaigns`** hiện liệt kê **Dự án** (`Project`) gom theo **Nhóm dự
  án** (`ProjectGroup`); route chi tiết `/campaigns/{projectId}` và
  `/campaigns/groups/{groupId}`. Module `src/modules/campaigns/*` cũ (chiến dịch
  theo tháng) không còn route nào trỏ tới. Hook `useMyProjects()` và
  `useProjectGroups()` đã có.
- **Điều hướng**: `src/components/common/AppSidebar.tsx` (`data.navMain`) và tiêu
  đề trang `src/components/common/SiteHeader.tsx` (`PAGE_TITLES`).

## Goals / Non-Goals

**Goals:**

- Data model độc lập, tối thiểu, đủ cho 5 đầu mục + link theo đầu mục + tham
  chiếu Dự án/Nhóm.
- Tái dùng đúng pattern `reference-links` cho phần đính link (kể cả helper
  `sort_index` và ngưỡng cảnh báo 20) để hành vi nhất quán.
- Phân quyền đặt trọn ở tầng route handler; client chỉ đọc.

**Non-Goals:**

- Không sửa hay mở rộng capability `reference-links` (giữ nó project-scoped).
- Không phân loại/tag tri thức, không phiên bản hoá nội dung, không bình luận,
  không kéo-thả sắp thứ tự ở cấp danh sách tri thức trong bản này.
- Không đọc nội dung link, không đồng bộ tên tham chiếu, không job nền.
- Không xử lý di trú dữ liệu đúc kết đang nằm trong Docs/Sheets cũ (nhập tay).

## Decisions

### 1. Ba collection mới, tách biệt hoàn toàn với `reference-links`

```text
knowledgeEntries (
  id, name, overview,
  detail_note?, process_note?, conclusion_note?,
  lifecycle: active | archived,
  created_by, created_at, updated_by?, updated_at
)

knowledgeLinks (
  id, entry_id,
  section: detail | process | conclusion,   -- đầu mục 3 / 4 / 5
  url, label, note?,
  created_by, created_at, sort_index
)

knowledgeProjectRefs (
  id, entry_id,
  ref_type: project | project_group,
  ref_id,                                    -- Project.id hoặc ProjectGroup.id
  ref_name,                                  -- ảnh chụp tên lúc gắn
  note?,
  created_by, created_at, sort_index
)
```

Đăng ký trong `src/lib/domain/collections.ts`; interface + Zod schema trong
`src/lib/domain/knowledge.ts`; enum `KNOWLEDGE_LIFECYCLES` /
`KNOWLEDGE_LINK_SECTIONS` / `KNOWLEDGE_PROJECT_REF_TYPES` trong
`src/lib/domain/enums.ts`.

**Vì sao không dùng lại `referenceLinks`:** server của `reference-links` phân giải
mọi owner về một `project_id` rồi gọi `requireProjectScope` (chặn người ngoài dự
án). Tri thức là cấp tổ chức — mọi thành viên đăng nhập thao tác được. Nhét owner
type mới vào sẽ phải rẽ nhánh toàn bộ logic quyền của một feature đã ship + đã có
test. `document-library` cũng đã chọn model riêng vì lý do tương tự.
*Đã cân nhắc:* thêm giá trị vào `REFERENCE_LINK_OWNER_TYPES` — loại vì rủi ro hồi
quy.

**Vì sao `knowledgeLinks` là collection riêng, không nhúng mảng vào entry doc:**
cần kéo sắp thứ tự và ghi độc lập từng link; nhúng mảng làm entry doc phình và mọi
sửa link thành một lần ghi cả doc. Một collection với cột `section` phân biệt đầu
mục — đúng pattern `referenceLinks`. Tái dùng thẳng `nextReferenceLinkSortIndex` /
`reorderReferenceLinks` (thuần, đã export) cho `sort_index`.

### 2. Tham chiếu Dự án/Nhóm lưu ảnh chụp tên, không join sống

`knowledgeProjectRefs.ref_name` chụp `name` của Dự án/Nhóm tại thời điểm gắn (đọc
server-side từ `projects/{id}` hoặc `projectGroups/{id}`, không tin `ref_name`
trong body). Thẻ tham chiếu hiển thị tên đã chụp và link tới
`/campaigns/{ref_id}` hoặc `/campaigns/groups/{ref_id}`.

*Vì sao:* khớp triết lý "chỉ lưu và mở, không đồng bộ" của `reference-links`;
tránh N+1 read khi render danh sách; và một lần đổi tên dự án không nên âm thầm
viết lại một bản đúc kết lịch sử. Link của thẻ vẫn trỏ sống nên đích luôn đúng.
*Đã cân nhắc:* join phía client bằng `useMyProjects()` — loại vì nhân sự có thể
không phải thành viên dự án được tham chiếu (sẽ không resolve được tên) và nó buộc
việc render phụ thuộc read dự án.

### 3. Nguồn cho ô chọn tham chiếu: dự án mình thấy + mọi nhóm

Ô chọn lấy Dự án từ `useMyProjects()` (dự án người dùng là thành viên) và Nhóm từ
`useProjectGroups()` (mọi người đăng nhập đọc được `projectGroups`). Server chỉ
xác thực `ref_id` tồn tại đúng loại, không kiểm tra tư cách thành viên (tham chiếu
là hành động tổ chức, không phải mở nội dung dự án).

### 4. Phân quyền: thành viên ghi nội dung, Trưởng phòng xoá/lưu trữ

| Thao tác | Quyền | Chốt tại |
|---|---|---|
| Xem tri thức + link + tham chiếu | mọi user đăng nhập | `firestore.rules` (`allow read: if isSignedIn()`) |
| Tạo / sửa tri thức; thêm/sửa/gỡ/sắp link; gắn/gỡ tham chiếu | mọi user đăng nhập | route handler: chỉ cần `getAuthedUser` (401 nếu chưa đăng nhập) |
| Xoá tri thức; lưu trữ / bỏ lưu trữ | `system_role = manager` | route handler: `requireSystemManager(actor)` |

Không có khái niệm "chủ sở hữu tri thức" — đây là tri thức chung. Sửa một entry
`archived` bị từ chối 409 (helper `isKnowledgeEntryWritable`, sao theo
`isProjectGroupWritable`). Xoá yêu cầu nhập lại đúng `name` (sao theo
`projectDeleteSchema`).
*Đã cân nhắc:* "người tạo mới sửa được" — loại, tri thức mang tính cộng tác, khớp
`document-library` "mọi thành viên".

### 5. API — route handlers dưới `src/app/api/knowledge/**`

| Route | Method | Việc | Quyền |
|---|---|---|---|
| `/api/knowledge` | POST | tạo tri thức | thành viên |
| `/api/knowledge/[entryId]` | PATCH / DELETE | sửa nội dung / xoá (cascade) | sửa: thành viên · xoá: manager |
| `/api/knowledge/[entryId]/lifecycle` | POST | lưu trữ / bỏ lưu trữ | manager |
| `/api/knowledge/[entryId]/links` | POST | thêm link vào một `section` | thành viên |
| `/api/knowledge/[entryId]/links/reorder` | PUT | sắp thứ tự link trong một `section` | thành viên |
| `/api/knowledge/links/[linkId]` | PATCH / DELETE | sửa / gỡ link | thành viên |
| `/api/knowledge/[entryId]/refs` | POST | gắn tham chiếu Dự án/Nhóm | thành viên |
| `/api/knowledge/refs/[refId]` | DELETE | gỡ tham chiếu | thành viên |

Service `src/modules/knowledge/services/knowledge.server.ts` (mẫu
`projectGroups.server.ts` + `referenceLinks.server.ts`). Đọc danh sách/chi tiết
KHÔNG qua API — client `onSnapshot` trực tiếp (mẫu `useProjectGroups`).

### 6. Giao diện

- `src/app/(dashboard)/knowledge/page.tsx` — danh sách (tìm theo tên, lọc "đã lưu
  trữ", nút "Tạo tri thức"); sắp theo `updated_at` giảm dần.
- `src/app/(dashboard)/knowledge/[entryId]/page.tsx` — trang chi tiết 5 đầu mục;
  đầu mục 3/4/5 mỗi cái một panel link (phỏng theo `ReferenceLinksPanel`); đầu
  mục 4 có thêm panel tham chiếu (thẻ + ô chọn Dự án/Nhóm).
- `src/modules/knowledge/` — `hooks/` (`useKnowledgeEntries`, `useKnowledgeEntry`
  gộp entry + links + refs), `components/`, `services/knowledge.client.ts`.
- Nút xoá/lưu trữ chỉ hiện khi `profile.system_role === "manager"`
  (`useAuth()`); server vẫn là chốt thật.
- `AppSidebar.tsx`: thêm `{ title: "Tri thức", url: "/knowledge", icon: … }` sau
  "Tài liệu". `SiteHeader.tsx`: thêm `"/knowledge": "Tri thức"`.

### 7. `firestore.rules`

Thêm sau block `referenceLinks/`:

```
match /knowledgeEntries/{entryId}   { allow read: if isSignedIn(); allow write: if false; }
match /knowledgeLinks/{linkId}      { allow read: if isSignedIn(); allow write: if false; }
match /knowledgeProjectRefs/{refId} { allow read: if isSignedIn(); allow write: if false; }
```

## Risks / Trade-offs

- **[Risk] Nhân sự muốn tham chiếu một dự án họ không phải thành viên** → ô chọn
  chỉ hiện dự án họ thấy + mọi nhóm. *Mitigation:* chấp nhận cho bản này; nếu cần
  tham chiếu chéo phòng, thêm endpoint "tìm mọi dự án" sau (xem Open Questions).
- **[Risk] `ref_name` cũ đi sau khi đổi tên** → thẻ hiện tên cũ. *Mitigation:* cố
  ý (không đồng bộ); link của thẻ vẫn trỏ đúng; có thể thêm nút "cập nhật tên"
  sau.
- **[Risk] Trùng ý với `document-library` đang làm dở** → phạm vi khác:
  `document-library` là danh sách link phẳng cho biên bản họp / văn bản tổ chức;
  `knowledge-base` là tri thức có cấu trúc 5 đầu mục + tham chiếu dự án. Giữ hai
  model + hai mục điều hướng riêng.
- **[Trade-off] Chưa kéo-thả sắp thứ tự ở cấp danh sách tri thức** → danh sách
  sắp theo `updated_at`. Đơn giản hơn; thêm `sort_index` sau như
  `project-grouping` đã làm nếu cần.
- **[Risk] Free-text phình document** → chặn độ dài trong Zod (vd `overview` ≤
  5000, mỗi `*_note` ≤ 20000, `label` ≤ 200, `note` ≤ 2000).

## Migration Plan

1. Thêm `src/lib/domain/knowledge.ts` + enum + đăng ký `collections.ts` + export
   ở `src/lib/domain/index.ts`. Verify: schema nhận body hợp lệ, từ chối enum sai
   / thiếu `name`/`overview` / URL sai định dạng.
2. Thêm service + route handlers + client wrappers.
3. Thêm 3 block `firestore.rules`, chạy `npm run rules:deploy` (deploy rules,
   giống các change trước).
4. Thêm module UI + trang + mục điều hướng.
5. Không có dữ liệu phải di trú. Rollback: gỡ 3 block rules, route, module, mục
   điều hướng; document của 3 collection để lại vô hại hoặc xoá tay. Không đụng
   dữ liệu khác.

## Open Questions

- Có cần cho tham chiếu tới **mọi** Dự án (kể cả dự án người dùng không là thành
  viên) không? Bản này giới hạn ở dự án mình thấy + mọi nhóm; mở rộng chỉ là đổi
  nguồn của ô chọn, không đổi spec hay data model.
- Có cần **phân loại/tag** tri thức (vd "content", "ads", "quy trình") để lọc
  không? Thuần bổ sung, làm sau được.
