# E2E — Ads Overview Reporting (task 7.7)

Manual end-to-end walkthrough for the `ads-overview-reporting` change. Do this
once against a real deploy with the 4 live Meta ad accounts, signed in as a
`system_role = manager` account. The automated coverage
(`adsOverview.integration.test.ts` + the per-file service tests) already checks
classification, aggregation, the conversion window, multi-currency, the video
comparison and permissions — this list is the things only a human + real Meta
data can confirm.

## 0. Prerequisites

- [ ] `firestore.rules` deployed (8 new `match` blocks, all `read, write: if false`).
- [ ] `npm run seed:ads-reporting` run **after** connecting the accounts — check
      `products/{a,t,h}` exist and `reportingSettings/default.reporting_currency`
      is set.
- [ ] Repo secrets `APP_URL` + `CRON_SECRET` present; `scheduled-jobs.yml` merged
      to `main` (GitHub Actions runs the default branch's workflow) so
      `reporting-campaign-sync` / `reporting-ad-sync` fire every 2h.

## 1. Connect + configure

- [ ] Connect the 4 accounts on `/ad-accounts` (`AMHD - Backup`, `AMHD-Backup 2`,
      `Độ - Hẻm TBĐM`, `Ha Phuong`).
- [ ] `/reports/settings` → each account shows under "Gán tài khoản → sản phẩm".
      The seed maps AMHD* → `a` (default), Độ / Ha Phuong → `t` (default) + `h`.
      Fix any that did not name-match.
- [ ] Add a keyword to a product → save → open `/reports` → the campaigns whose
      name contains it move product **without** a re-sync.
- [ ] Set `reporting_currency`; add an FX rate for any non-VND account.

## 2. Backfill

- [ ] Trigger `reporting-campaign-sync` (GitHub Actions → Run workflow →
      `reporting-campaign-sync`, or `curl -H "Authorization: Bearer $CRON_SECRET"
      $APP_URL/api/jobs/reporting-campaign-sync`).
- [ ] `adsInsightSnapshots` fills for ~90 days back, none for today.
- [ ] `adAccountReportSyncStates/{acc}__campaign` shows `last_result: ok`,
      `latest_synced_date` = yesterday.
- [ ] Run it again → snapshot count for a given day does not grow (deterministic
      id upsert).

## 3. Product report (`/reports` → "Hiệu quả quảng cáo")

- [ ] Month view: 3 product blocks + "Tổng 3 sản phẩm" + "Chưa phân loại" row.
      Total = sum of the 3 products; "Chưa phân loại" is separate.
- [ ] Cross-check one product's spend / revenue against Meta Ads Manager
      (filter to that product's campaigns, same date range, same currency).
- [ ] Freshness line reads "Số liệu tính đến …" and "Đang gộp N/M tài khoản".
- [ ] Toggle "So sánh kỳ trước" → each block gains a Δ%; a product with no data
      last month shows "—" for %.
- [ ] Switch to Week, then to a custom date range (compare toggle hides).

## 4. Trend chart

- [ ] Chart renders; switch metric (Chi phí / Doanh thu / ROAS) and bucket
      (Ngày / Tuần / Tháng) → it redraws with the right number of points.
- [ ] Filter to one product → single series; back to "Cả 3 sản phẩm" → 3 (+ a
      "Chưa phân loại" line if any).
- [ ] Pick a range with no spend → "Chưa có dữ liệu trong khoảng này".
- [ ] Toggle the OS to dark mode → chart + page stay readable.

## 5. Export

- [ ] "Xuất báo cáo" → CSV opens in Excel with Vietnamese intact (BOM), one row
      per product + total + "Chưa phân loại".
- [ ] "Xuất biểu đồ" → CSV has one row per bucket × product.

## 6. Video comparison

- [ ] On `/campaigns/<project>`, a content item **with** an active ad-level
      AdsBinding shows "Xem hiệu quả"; one without does not; a staff account
      never sees it.
- [ ] Click it on 3 different videos → they accumulate into one table
      (columns = videos). A 7th is blocked with a toast.
- [ ] The 4 core metrics always show. Tick CTR + reach → two more rows appear
      and are remembered on the next visit.
- [ ] A video just bound (no sync cycle yet) shows "đang lấy số liệu…".
- [ ] Change the period → every metric + reach recomputes.
- [ ] Trend chart: pick a metric → one line per video.
- [ ] "Xuất CSV" → one row per video with the shown metrics.

## 7. Cadence / recovery

- [ ] Leave it a day → the 2h crons keep `latest_synced_date` current.
- [ ] Revoke one account's token on Meta → next sync marks it
      `needs_reconnect`; the report still renders from the other 3 and the
      freshness line names the delayed account.
