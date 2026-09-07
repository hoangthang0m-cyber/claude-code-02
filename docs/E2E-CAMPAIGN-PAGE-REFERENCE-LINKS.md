# E2E — Campaign Page / Reference Links (task 7.6)

Manual walkthrough for `campaign-page-reference-links`. Automated coverage:
`campaignPageReferenceLinks.integration.test.ts` (nothing sheets-sync survives,
Meta paths intact), `referenceLinks.server.test.ts` (CRUD + permissions +
reorder + >20 warning + URL format), `projects.server.test.ts` (create →
reference link), plus the whole content-pipeline suite staying green (7.4).

## 0. Prerequisites

- [ ] Branch merged to `main` and deployed.
- [ ] `firestore.rules` published (new `match /referenceLinks/{linkId}` block;
      the `sheetSyncMappings` / `syncRuns` / `syncConflicts` / `googleConnections`
      blocks are gone).
- [ ] `npm run migrate:progress-links -- --write` run once — every project that
      had `progress_sheet_url` now has a "Tiến độ dự án" reference link and the
      dead field is stripped.
- [ ] Vercel env: `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` can be
      removed (nothing uses them). Do NOT remove `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
      (that is the Google **login** button).

## 1. Sheets sync is gone

- [ ] Open a project (`/campaigns/<id>`). There is **no** "Đồng bộ Google Sheets"
      card, no column-mapping panel, no sync log, no "đồng bộ ngay" button.
- [ ] `/ad-accounts` — the Meta Ad Accounts panel is there; the Google connect
      panel is gone.
- [ ] GitHub Actions → the `scheduled-jobs` workflow no longer has a
      `sheets-sync` option / schedule.

## 2. Reference links — project level

- [ ] On the project page there is a "Tài liệu tham khảo" section.
- [ ] Old project: it already lists "Tiến độ dự án" (from the migration), opening
      in a new tab, with no sync status.
- [ ] Add a link: paste a Google Sheets URL, label "Timeline chi tiết" → it
      appears, clickable, opens in a new tab.
- [ ] Add a Google Docs and a Drive link — all accepted.
- [ ] Try adding a link with no label → blocked with "Cần nhập nhãn".
- [ ] Try `not a url` → blocked on format (no Google call made).
- [ ] Edit a label inline → saved. Delete a link → gone, other links + the
      project untouched.
- [ ] Up/down arrows reorder the list; the order sticks on refresh.
- [ ] Add links until there are 21 → a "đang có nhiều link, nên gộp/dọn bớt"
      warning shows; adding still works.
- [ ] As a **staff** member (not manager): you can still add / edit / delete /
      reorder. As a non-member: the project page 403s anyway.

## 3. Reference links — content item level

- [ ] The content table's last column is "Tài liệu" (after "Đánh giá"); the 10
      original columns are unchanged in order.
- [ ] A row with no links shows "—"; click it → a sheet opens with that item's
      own reference-links panel (separate from the project's).
- [ ] Add 2 links to one item → the cell shows "2".
- [ ] A Google Sheet attached here creates **no** content items; editing that
      sheet later changes nothing in the app and raises no notification.

## 4. Manual content entry (regression)

- [ ] "Thêm hạng mục" with just a Mã → new item at the first status.
- [ ] Edit Deadline / Nhân sự / Chủ đề / Định dạng / link fields inline → saved
      with updated_by + time.
- [ ] Kanban toggle, filters, sort, comments, status transitions all work as
      before.
- [ ] No `tmp-*` codes appear anywhere.

## 5. "Báo cáo hiệu quả ads" column (regression)

- [ ] Item with an AdsBinding + a sync cycle → Meta figures (ROAS / CPP /
      messages / CTR / spend) + "đến <ngày>" + "Tự động".
- [ ] Item with no AdsBinding → "Chưa có dữ liệu — liên kết ad để lấy số liệu từ
      Meta".
- [ ] As manager: type into the "Ghi chú ads" box → saved, shown next to the
      Meta figure, never merged into or overwritten by the synced numbers.
- [ ] `/reports` (ads-overview) and its sync jobs are unaffected.
