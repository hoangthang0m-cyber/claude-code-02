# Ads Overview Reporting — derived spec & checklist

Source of truth: OpenSpec change `ads-overview-reporting`
(`tasks-docs/openspec/changes/ads-overview-reporting/` — `proposal.md`,
`design.md`, `specs/ads-overview-reporting/spec.md`,
`specs/ads-creative-comparison/spec.md`). This file is the in-repo working copy
of that spec plus the build checklist. If code conflicts with the OpenSpec
change, report it — do not self-resolve.

The feature is a **manager-only** ad-performance report on `/reports`, organised
**by product** (not by ad account), plus a **video comparison** table opened
from the Chiến dịch page. It **reuses** `AdAccountConnection` (`ads-performance`)
and `AdsBinding` (`content-pipeline` + `ads-performance`) — no new Meta connect
mechanism.

## Products & classification (design.md Decision 2)

Three fixed products, code = one letter matched as a token in campaign names:

| code | product |
|---|---|
| `a` | An Mệnh Hòa Duyên (AMHD) |
| `t` | Tứ Bản Định Mệnh (TBĐM) |
| `h` | Hiếu Mệnh Dưỡng Con (HMDC) — keyword `hmdc` |

`classifyCampaign(input, config)` (`src/lib/domain/campaignClassify.ts`) stops at
the first hit:

1. **Override** — a `CampaignProductOverride` row for `(ad_account_id, campaign_id)`.
2. **Keyword / code in the name** — normalise (lowercase, strip diacritics,
   collapse whitespace), then: a `Product.keywords` substring, else the code
   regex `(?:^|[\s-])([ath])\s*[(/\d-]` (matches `t(20/8)`, `a - `, `h(16/8)`;
   not the `t` in `thang`).
3. **Account default** — the `ProductAccountRule` with `is_account_default` for
   that ad account.
4. **`null` = "Chưa phân loại"** — only when the account has no
   `ProductAccountRule` at all.

Classification is **pure and evaluated on read** — a rule change takes effect on
the next report with no re-sync. "Chưa phân loại" is shown as its own row and is
**excluded** from the 3-product total.

Seed accounts (design.md Decision 2), wired by `npm run seed:ads-reporting`
against already-connected accounts, name-matched:

| account name contains | rules |
|---|---|
| `amhd` | product `a`, default |
| `tbdm` or `ha phuong` | product `t` (default) + product `h` |

## Data model (design.md Decision 1) — Firestore collections

All server-written; `firestore.rules` denies client read+write (manager-only,
via route handlers). Deterministic doc ids enforce the "UNIQUE" keys.

| collection | doc id | notes |
|---|---|---|
| `products` | `code` | `{ code, name, keywords[] }` |
| `productAccountRules` | `${ad_account_id}__${product_id}` | `is_account_default` |
| `campaignProductOverrides` | `${ad_account_id}__${campaign_id}` | manual pin, `set_by` / `set_at` |
| `adsInsightSnapshots` | `${ad_account_id}__${campaign_id}__${stat_date}` | campaign × day; `spend/revenue/purchases/impressions/clicks`, `campaign_name/status/objective`, `account_currency`, `data_as_of` |
| `adCreativeInsightSnapshots` | `${ad_account_id}__${ad_id}__${stat_date}` | ad × day, only ads with an `AdsBinding`; adds `video_plays/video_3s_plays/video_p100_plays` |
| `adAccountReportSyncStates` | `${ad_account_id}__${scope}` | scope = `campaign` \| `ad` |
| `reportingSettings` | `default` | `reporting_currency` (seed `VND`) |
| `currencyRates` | `${from}__${to}__${effective_from}` | manager-entered, no auto FX |

`product_id` is **never** stored on a snapshot.

## Formulas (design.md Decision 5) — `src/lib/domain/adsReporting.ts`

Every ratio is computed from the **sum of the scope**, never an average of
child ratios. Zero denominator → `null` (rendered "—").

| metric | formula |
|---|---|
| ROAS | Σrevenue / Σspend |
| Chi phí / lượt mua | Σspend / Σpurchases |
| Hook rate | Σvideo_3s_plays / Σvideo_plays |
| Retention | Σvideo_p100_plays / Σvideo_3s_plays |
| CTR | Σclicks / Σimpressions |

Currency: `convertCurrency(amount, from, to, rates, onDate?)` — newest rate with
`effective_from <= onDate`, else newest overall; no pair → `{ ok: false }` and
the account is dropped from the total ("đang gộp N/M tài khoản").

## Checklist

### 1. Data model & nền tảng
- [x] 1.1 `Product` + seed 3 sản phẩm — `products` collection, `productWriteSchema` (+ parse tests), seed script
- [x] 1.2 `ProductAccountRule`, `CampaignProductOverride` — domain types + schemas (+ parse tests) + deterministic ids. (Firestore: không có "migration lên/xuống" — schema parse tests là kiểm chứng tương đương.)
- [x] 1.3 `AdsInsightSnapshot` + UNIQUE (doc id `${acc}__${camp}__${date}`) + id test
- [x] 1.4 `AdCreativeInsightSnapshot` + UNIQUE (doc id `${acc}__${ad}__${date}`), video_* fields + id test
- [x] 1.5 `AdAccountReportSyncState`, `ReportingSettings`, `CurrencyRate` (+ parse tests); seed `reporting_currency = VND`
- [x] 1.6 `aggregateSnapshots` — Σ + ROAS / cost-per-purchase / hook / retention / CTR, ÷0 → null; unit tests
- [x] 1.7 `convertCurrency` — same-currency / dated rate / current fallback / missing pair; unit tests
- [x] 1.8 `requireReportingManager` — one shared gate, `system_role = manager`, server-enforced (+ 403 test). Chưa có điểm gọi (page/API tới ở nhóm 2.5 / 5).

### 2. Phân loại campaign → sản phẩm
- [x] 2.1 `normalizeCampaignName` — lowercase, bỏ dấu, đ→d, gộp khoảng trắng; unit tests
- [x] 2.2 `productCodeInName` — regex token `{a,t,h}`; khớp `t(20/8)` / `a - ` / `h(16/8)`, không khớp `thang` / `content`
- [x] 2.3 `classifyCampaign` — override → keyword/code → account default → null; unit tests mọi nhánh
- [x] 2.4 Seed `Product` + `ProductAccountRule` cho tài khoản **đã kết nối** (name-match `amhd` / `tbdm` / `ha phuong`), `npm run seed:ads-reporting`. 4 tài khoản cụ thể chỉ gắn được sau khi kết nối (chưa biết Ad Account ID) — design.md Migration Plan bước 5 giao việc gắn cho Trưởng phòng qua UI (2.5 / 5.6). Nhánh classify đã được test đầy đủ với config hình-seed.
- [x] 2.5 API cấu hình dưới `/api/ads-reporting/*`: `GET config`, `POST/PATCH/DELETE products`, `PUT account-rules` (đặt cả bộ + mặc định), `POST campaign-overrides` (gán tay / xoá). Manager-only, có test service.
- [x] 2.6 `GET /api/ads-reporting/unclassified?period=|date=` (hoặc `from`/`to`) — `summarizeUnclassified` thuần (đếm campaign ở tài khoản chưa có rule, Σ chi phí/doanh thu quy đổi tiền tệ, liệt kê tài khoản thiếu tỷ giá). Có unit test + test wrapper.

### 3. Đồng bộ Meta Ads API — `src/lib/server/meta/reportingInsights.ts` + `src/modules/ads-overview/services/reportSync.server.ts`
- [x] 3.1 `fetchCampaignInsights` — `level=campaign` `time_increment=1` `time_range`; revenue/purchases từ `omni_purchase`; theo `paging.next`
- [x] 3.2 `fetchAdInsights` — `level=ad`, lọc theo `ad.id IN [...]` (rỗng → không gọi), thêm `video_plays/video_3s_plays/video_p100_plays`
- [x] 3.3 `fetchAdReach` + `ReachCache` — 1 truy vấn cả kỳ, không `time_increment`, cache theo (ad, kỳ chính xác)
- [x] 3.4 `syncCampaignSnapshots` — cửa sổ `[latest_synced_date - 7d, hôm qua]`, upsert theo doc id tất định (chạy 2 lần không trùng), job `/api/jobs/reporting-campaign-sync`
- [x] 3.5 `syncAdSnapshots` — chỉ `ad_id` trong `AdsBinding` `object_level=ad` `active`; backfill 90 ngày khi binding mới hơn `last_full_sync_at`; job `/api/jobs/reporting-ad-sync`
- [x] 3.6 Backfill 90 ngày khi chưa có `latest_synced_date`; re-sync rộng 28 ngày nếu `last_full_sync_at` > 7 ngày; `monthChunks` chia request theo tháng
- [x] 3.7 `until = hôm qua` (không bao giờ hôm nay); `withMetaRetry` lùi dần 3 lần; auth error → `AdAccountConnection.state = needs_reconnect` + `last_result: error`; rate-limit/transient → giữ snapshot cũ + `last_result: warning`. Lịch chạy trong `.github/workflows/scheduled-jobs.yml` (mỗi 2h).

### 4. API báo cáo sản phẩm — `productReport.ts` (thuần) + `.server.ts` + `/api/ads-reporting/*`
- [x] 4.1 `GET /report` — `buildProductReport`: mỗi sản phẩm + khối tổng (chi phí/doanh thu/ROAS), classify + quy đổi tiền tệ theo ngày. ROAS = 0 (không để trống) khi có chi phí, doanh thu 0.
- [x] 4.2 `report.unclassified` là dòng riêng, `report.total` chỉ gồm 3 sản phẩm.
- [x] 4.3 `GET /timeseries?bucket=day|week|month&product_id=?` — `buildTimeseries` + `bucketOf` (tuần = thứ Hai ISO, tháng = mùng 1, dùng `resolveReportPeriod`); chuỗi 0-fill; chuỗi "Chưa phân loại" khi có.
- [x] 4.4 `GET /report/comparison?period=week|month&date=` — Δ tuyệt đối + % (`computeMetricDelta`) cho từng sản phẩm + tổng vs kỳ liền trước; kỳ trước rỗng → `pct: null` ("—"). Từ chối `from`/`to`.
- [x] 4.5 `report.freshness` — `data_through` (max `latest_synced_date`), `accounts_total` (M), `accounts_merged` (M − thiếu tỷ giá − lỗi), `accounts_delayed` (last_result ≠ ok), `accounts_missing_rate`.
- [x] 4.6 `GET /export?format=report|timeseries` — CSV (BOM UTF-8 cho Excel), `Content-Disposition: attachment`.

### 5. Giao diện trang Báo cáo — `src/modules/ads-overview/components/**`, route `/reports` (+ `/reports/settings`)
- [x] 5.1 `/reports` = tab "Hiệu quả quảng cáo" (manager) + "Tiến độ nội dung"; `AdsOverviewView` có bộ chọn Tuần/Tháng/Khoảng ngày + ô date + toggle so sánh; trạng thái rỗng "chưa kết nối tài khoản" → link `/ad-accounts`.
- [x] 5.2 4 khối (3 sản phẩm + khối Tổng) chi phí/doanh thu/ROAS, kèm Δ% khi bật so sánh (từ `/report/comparison`); dòng "Chưa phân loại" riêng. Dòng "số liệu tính đến … / đang gộp N/M tài khoản / trễ-lỗi / thiếu tỷ giá".
- [x] 5.3 `ReportTrendChart` (shadcn `ChartContainer` + Recharts): Area cho chi phí/doanh thu, Line cho ROAS; công tắc Ngày/Tuần/Tháng + chọn chỉ số + lọc 1 sản phẩm / cả 3 chồng nhau.
- [x] 5.4 Biểu đồ rỗng → nhãn "Chưa có dữ liệu trong khoảng này"; `ChartContainer` responsive + theme-aware sẵn.
- [x] 5.5 Nút "Xuất báo cáo" / "Xuất biểu đồ" → `/api/ads-reporting/export` qua `downloadCsv`.
- [x] 5.6 `/reports/settings` (`ProductConfigView`, manager-only): CRUD sản phẩm, gán tài khoản → sản phẩm (chọn + đặt mặc định), bảng gán tay campaign, ô `reporting_currency` + bảng tỷ giá. APIs mới: `PUT /settings`, `POST/DELETE /currency-rates`.

### 6. So sánh video ads (từ trang Chiến dịch)
- [ ] 6.1 Nút "Xem hiệu quả" trên dòng video có `AdsBinding`
- [ ] 6.2 Bảng so sánh nhận danh sách `content_item_id` (URL param); giới hạn cứng 6 video
- [ ] 6.3 API bảng so sánh — cộng dồn `AdCreativeInsightSnapshot`; 4 cốt lõi + phụ
- [ ] 6.4 Bộ chọn chỉ số hiển thị; nhớ lựa chọn; reach cấp kỳ
- [ ] 6.5 Chọn kỳ cho bảng so sánh
- [ ] 6.6 Biểu đồ diễn biến trong bảng so sánh
- [ ] 6.7 Trạng thái "đang lấy số liệu" cho video vừa gắn ad
- [ ] 6.8 Xuất CSV/Excel bảng so sánh

### 7. Kiểm thử & xác minh tích hợp
- [ ] 7.1–7.7 (phân loại, cộng dồn, cửa sổ quy đổi, đa tiền tệ, bảng so sánh, phân quyền, E2E thủ công)
