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

### 1. Gỡ đồng bộ Google Sheets
- [x] 1.1 Rà soát nơi dùng Google API — bảng trên
- [ ] 1.2 Gỡ endpoint đồng bộ
- [ ] 1.3 Gỡ job nền + cron
- [ ] 1.4 Gỡ module đọc/ghi Sheets, chuẩn hoá cột, tra trạng thái, xung đột
- [ ] 1.5 Drop `SheetSyncMapping`, `SyncRun`, `SyncConflict`, `SheetStatusAlias`; bỏ `ContentItem.sheet_row_ref` + cờ mất liên kết
- [ ] 1.6 Huỷ `sheets-sync-fixed-schema` (xoá nhánh)
- [ ] 1.7 Bỏ khái niệm "mã tạm" (`tmp-*`)

### 2. Data model tài liệu tham khảo
- [ ] 2.1 Collection `referenceLinks`
- [ ] 2.2 Migration `progress_sheet_url` → `ReferenceLink`, bỏ cột
- [ ] 2.3 Giữ `ContentItem.ads_report_note`

### 3. API tài liệu tham khảo
- [ ] 3.1 Thêm link (label bắt buộc) — [ ] 3.2 Sửa/xoá — [ ] 3.3 Liệt kê + sắp thứ tự — [ ] 3.4 Validate URL nhẹ — [ ] 3.5 Phân quyền (mọi thành viên) — [ ] 3.6 Cảnh báo > 20

### 4. Trang Chiến dịch
- [ ] 4.1 Bỏ card "Đồng bộ Google Sheets" — [ ] 4.2 Card "Tài liệu tham khảo" cấp dự án — [ ] 4.3 Phần tài liệu trong hạng mục — [ ] 4.4 Cột "Tài liệu" ở cuối bảng

### 5. Bảng hạng mục nhập tay
- [ ] 5.1 Giữ đúng 10 cột cũ — [ ] 5.2 Tạo nhanh + sửa trực tiếp — [ ] 5.3 Form chi tiết — [ ] 5.4 Kanban/lọc/sắp xếp/bình luận hồi quy

### 6. Cột "Báo cáo hiệu quả ads"
- [ ] 6.1 Có AdsBinding → chỉ số Meta — [ ] 6.2 Chưa có → ô trống + gợi ý — [ ] 6.3 `ads_report_note` tách riêng — [ ] 6.4 Bỏ đường text từ sheet

### 7. Kiểm thử & xác minh tích hợp
- [ ] 7.1–7.6
