# Campaign Page — Reference Links (bỏ đồng bộ Google Sheets)

Nguồn sự thật: OpenSpec change `campaign-page-reference-links`
(`tasks-docs/openspec/changes/campaign-page-reference-links/`). File này là bản
làm việc trong repo + checklist. Nếu code hiện tại mâu thuẫn với change → báo,
không tự quyết.

**BREAKING.** Bỏ hoàn toàn đồng bộ 2 chiều Google Sheets. Thay bằng "Tài liệu
tham khảo": mỗi dự án / hạng mục đính được nhiều link có nhãn, hệ thống chỉ mở
link, **không đọc nội dung, không đồng bộ**. Hạng mục nội dung nhập tay hoàn
toàn. **Meta Ads không đụng** — cột "Báo cáo hiệu quả ads" vẫn lấy số từ Meta.

---

## Task 1.1 — Rà soát nơi dùng Google API (DONE)

### A. Google Sheets sync — GỠ HẾT (tách biệt hoàn toàn với Meta)

| Loại | File |
|---|---|
| OAuth client | `src/lib/server/google/oauth.ts` (scope `spreadsheets` + `drive.metadata.readonly`) |
| REST client | `src/lib/server/google/sheets.ts` (Sheets v4 `values.get/update`, Drive v3 `files`) |
| Route | `src/app/api/google/connect/start`, `.../callback`, `src/app/api/google/connection` |
| Route | `src/app/api/jobs/sheets-sync` |
| Route | `src/app/api/projects/[projectId]/sheet/{verify,preview,mapping,sync}` (4) |
| Service | `src/modules/sheets-sync/services/{googleConnection.server, google.client, sheetSync.server, sheetPull.server, sheetPush.server, sheetMapping.server, sheetRows}.ts` |
| Domain | `src/lib/domain/{googleConnection, sheetSyncMapping, syncRun, syncConflict}.ts` |
| Domain | `collections.ts`: `sheetSyncMappings`, `syncRuns`, `syncConflicts`, `googleConnections` |
| Domain | `enums.ts`: `SYNC_KINDS`, `SYNC_RESULTS`, `SYNC_CONFLICT_RULES`, `SYNC_CONFLICT_SIDES`, `GOOGLE_CONNECTION_STATES`; nhóm `sync` + type `sync_issue` trong NOTIFICATION_* |
| Domain | `contentItem.ts`: `sheet_row_ref`, `sheet_unlinked_at` |
| Domain | `project.ts`: `progress_sheet_url` (→ ReferenceLink) |
| UI | `src/modules/sheets-sync/components/{GoogleConnectPanel, SheetSyncLog, SheetSyncPanel}.tsx` |
| UI | `src/app/(dashboard)/ad-accounts/page.tsx` (`<GoogleConnectPanel/>`) |
| UI | `src/modules/project-workspace/components/ProjectWorkspace.tsx` (`<SheetSyncPanel/>`) |
| Job | `.github/workflows/scheduled-jobs.yml`: cron `sheets-sync` + case + option |
| Env | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (người dùng gỡ khỏi Vercel) |

**Điểm chạm dùng chung — GIỮ, chỉ sửa phần Sheets:**
- `src/lib/server/oauthState.ts` (`sealOAuthState` / `openOAuthState`) — Meta OAuth cũng dùng. GIỮ.
- `src/lib/server/crypto.ts` (`encryptSecret` / `decryptSecret`) — Meta token cũng dùng. GIỮ (sửa comment).
- `src/modules/project-workspace/services/projects.server.ts` — hàm `deleteProject` cascade xoá `syncRuns`/`syncConflicts`/`sheetSyncMappings` của dự án → bỏ 3 dòng cascade đó.
- `src/modules/content-pipeline/{components/ContentRow.tsx, services/content.client.ts}` — badge "mất liên kết sheet" (`sheet_unlinked_at`) → bỏ.
- `enums.ts` NOTIFICATION_* — `sync_issue` chỉ do `sheetPull.server.ts` + `sheetSync.server.ts` phát; adsSync **không** phát → gỡ `sync_issue` + nhóm `sync`.

### B. Meta Ads OAuth — TÁCH BIỆT, KHÔNG ĐỤNG

`src/lib/server/meta/**`, `src/app/api/ad-accounts/meta/**`,
`src/modules/ads-performance/services/{adAccounts,tokenRefresh}.server.ts`,
`src/modules/ads-overview/**`. Dùng `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`,
`graph.facebook.com`. Cột "Báo cáo hiệu quả ads" lấy từ `AdsMetric` (do Meta sync
ghi). **Không liên quan Google.**

### C. Không phải Sheets sync — KHÔNG ĐỤNG

- `src/components/forms/LoginForm.tsx` — Google Sign-In = đăng nhập Firebase Auth
  (`GoogleAuthProvider`, GSI, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
- `src/app/layout.tsx` — `next/font/google` (font Geist).
- `src/components/forms/FileUploader.tsx`, `src/config/upload.ts` — MIME
  `spreadsheetml` cho upload file, không phải Sheets API.
- `src/lib/firebaseErrors.ts` — chuỗi lỗi "popup đăng nhập Google".

### D. `sheets-sync-fixed-schema` — HỦY

Nhánh `feat/sheets-sync-fixed-schema` (2 commit `d1f3b05`, `99942fd` + 1 commit
`a39e017` "aor prep" helper Meta) chưa merge `main`. Task 1.6: xoá nhánh (local +
remote), không có migration Firestore để hoàn tác. Helper Meta trong `a39e017`
(`listMetaCampaigns`…) chưa dùng ở đâu — bỏ luôn, cần thì viết lại (~40 dòng).

**Kết luận:** toàn bộ Google API trong codebase chỉ phục vụ đồng bộ Sheets, hoàn
toàn tách biệt Meta Ads. Gỡ an toàn theo nhóm 1–4 của change này.

---

## Checklist

### 1. Gỡ đồng bộ Google Sheets — XONG
- [x] 1.1 Rà soát nơi dùng Google API — bảng trên
- [x] 1.2 Gỡ 4 endpoint `/api/projects/[id]/sheet/{verify,preview,mapping,sync}`
- [x] 1.3 Gỡ job `/api/jobs/sheets-sync` + cron `sheets-sync` trong `scheduled-jobs.yml`
- [x] 1.4 Xoá `lib/server/google`, `api/google`, cả module `sheets-sync`; `googleConnection` domain + `googleConnections` collection + `GOOGLE_CONNECTION_STATES` + rule
- [x] 1.5 Xoá domain `sheetSyncMapping`/`syncRun`/`syncConflict` + collection + rule; bỏ `ContentItem.sheet_row_ref` / `sheet_unlinked_at` (+ badge "mất liên kết sheet"); gỡ `SYNC_KINDS`/`SYNC_CONFLICT_*`, notification `sync_issue` + nhóm `sync`; `deleteProject` bỏ cascade sync; `updateProject` bỏ logic reset mapping. `SheetStatusAlias` chưa từng có trên `main` → không cần drop. (767 test pass)
- [x] 1.6 Xoá nhánh `feat/sheets-sync-fixed-schema` (local + remote). Không có migration Firestore để hoàn tác.
- [x] 1.7 Không nơi nào sinh mã `tmp-*` (đã theo module `sheets-sync` bị xoá). `createContentItem` yêu cầu `code` tường minh.

### 2. Data model tài liệu tham khảo — XONG
- [x] 2.1 `src/lib/domain/referenceLink.ts` (ReferenceLink + schema + sort helpers) + collection `referenceLinks` + firestore.rules (client đọc, ghi qua server). 10 unit test.
- [x] 2.2 `Project.progress_sheet_url` bỏ hẳn khỏi interface + `projectFormUpdateSchema`. Create form: field `progress_link_url` (create-only) → `createProject` tạo `ReferenceLink` label "Tiến độ dự án". `npm run migrate:progress-links -- --write` cho dữ liệu cũ (idempotent).
- [x] 2.3 `ContentItem.ads_report_note` thêm (không tồn tại trên `main` — di sản `sheets-sync-fixed-schema` chưa merge; spec §"giữ lại" → thực chất là thêm mới cho task 6.3) + trong `contentFieldUpdateSchema`.

### 3. API tài liệu tham khảo — `referenceLinks.server.ts` + `/api/reference-links{,/[linkId],/reorder}` (9 test)
- [x] 3.1 `addReferenceLink` — label bắt buộc (schema), owner_type+owner_id trong body
- [x] 3.2 `updateReferenceLink` / `deleteReferenceLink`
- [x] 3.3 `listReferenceLinks` sắp theo sort_index; `reorderReferenceLinkList` (đúng bộ id của owner)
- [x] 3.4 URL http(s) mức nhẹ — KHÔNG gọi Google API
- [x] 3.5 `requireProjectScope` (mọi thành viên, kể cả Nhân sự); owner content_item → project_id; người ngoài → 403
- [x] 3.6 cờ `over_warn_limit` khi > 20 (không chặn thêm)

### 4. Trang Chiến dịch — XONG
- [x] 4.1 Card "Đồng bộ Google Sheets" đã gỡ (1.4)
- [x] 4.2 `ReferenceLinksPanel` cấp dự án trong `ProjectWorkspace` (list + thêm/sửa/xoá inline + lên/xuống + cảnh báo)
- [x] 4.3 `ReferenceLinksCell` → Sheet chứa panel của hạng mục
- [x] 4.4 Cột "Tài liệu" cuối bảng; `content.server` join `reference_link_count` (batched)

### 5. Bảng hạng mục nhập tay
- [x] 5.1 12 cột: 10 cột spec đúng thứ tự (Mã…Đánh giá) + "Định dạng" (từ content-performance-tracker Q3, giữ) + "Tài liệu" cuối
- [x] 5.2 Quick-add bằng Mã + sửa inline (đã có sẵn trong content-pipeline)
- [x] 5.3 **Không có form modal chi tiết riêng** — bảng inline đã phủ mọi trường (spec: "trên bảng HOẶC form chi tiết"). Nếu cần form riêng → task bổ sung.
- [x] 5.4 Kanban / lọc / sắp xếp / bình luận không đổi (793 test xanh)

### 6. Cột "Báo cáo hiệu quả ads"
- [x] 6.1 `AdsReportCell` giữ nguyên (chỉ số Meta + "đến {ngày}" + Tự động/Nhập tay)
- [x] 6.2 Ô trống → "Chưa có dữ liệu — liên kết ad để lấy số liệu từ Meta"
- [x] 6.3 `AdsNoteEditor` — textarea `ads_report_note` nhập tay, manager-only, cạnh chỉ số Meta, không trộn/ghi đè
- [x] 6.4 Không còn đường text từ sheet (module `sheets-sync` đã xoá)

### 7. Kiểm thử & xác minh tích hợp
- [x] 7.1 `campaignPageReferenceLinks.integration.test.ts` — không còn module/lib/route/collection/notification sheets-sync; không file nào import chúng
- [x] 7.2 `projects.server.test.ts` — createProject biến `progress_link_url` thành ReferenceLink, không ghi vào project doc
- [x] 7.3 `referenceLinks.server.test.ts` — thêm nhiều link, Nhân sự xoá được, người ngoài 403, cảnh báo > 20, sắp thứ tự, URL sai định dạng bị từ chối, Sheet không tạo hạng mục
- [x] 7.4 Toàn bộ suite content-pipeline xanh (793 test)
- [x] 7.5 `campaignPageReferenceLinks.integration.test.ts` — Meta lib / ad-account routes / ads-overview + ads-performance còn nguyên
- [ ] 7.6 E2E thủ công — `docs/E2E-CAMPAIGN-PAGE-REFERENCE-LINKS.md`
