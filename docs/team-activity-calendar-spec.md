# Team Activity Calendar — Bản đặc tả hợp nhất (để triển khai)

> File này gộp proposal + design + 8 spec + task list của OpenSpec change
> `team-activity-calendar` thành MỘT file duy nhất để đưa cho trợ lý code ở
> một repo khác. Đọc theo thứ tự:
>
> - **Mục A — Proposal**: vì sao & thay đổi gì (WHAT, mức cao).
> - **Mục B — Đặc tả từng capability**: hợp đồng hành vi (WHAT, chi tiết). Mỗi
>   `#### Scenario` là một ca kiểm thử. Dùng SHALL/MUST = bắt buộc.
> - **Mục C — Design**: quyết định kỹ thuật (HOW) — mô hình dữ liệu Firestore,
>   truy vấn, lặp lại, nhắc nhở, security rules.
> - **Mục D — Tasks**: checklist triển khai theo thứ tự phụ thuộc, mỗi task có
>   tiêu chí nghiệm thu.
>
> Nếu cần sửa yêu cầu: sửa ở change gốc rồi tạo lại file này, đừng sửa tay ở đây.

---

# CÂU TRẢ LỜI OPEN QUESTIONS (chốt với Trưởng phòng 2026-09-07)

Bốn câu hỏi mở ở cuối Mục C đã được chốt. Bản triển khai trong repo này bám theo
các quyết định sau; khi chúng khác Mục C, các quyết định này thắng.

1. **Collection người dùng gốc = `users`** (Cloud Firestore). Doc id = Firebase Auth
   uid; trường `name`, `email`, `system_role: "manager" | "staff"`, `avatar?`
   (`src/services/users.service.ts`, `src/types/user.ts`). KHÔNG có "danh bạ thành
   viên phòng marketing" tách riêng và KHÔNG có trường `active` — `users` chính là
   danh bạ. Vai trò đọc server-side ở `src/lib/server/auth.ts`.

2. **KHÔNG dùng Firebase Cloud Functions.** App deploy trên Vercel (gói Hobby);
   Firebase chỉ cung cấp Firestore + Auth + Storage; không có runtime Cloud
   Functions trong repo. Mọi việc Mục C giao cho Cloud Functions được làm lại bằng
   **Next.js route handler dưới `/api/jobs/**`, bảo vệ bằng `CRON_SECRET`, kích hoạt
   bằng GitHub Actions cron** (giống `sheets-sync` / `ads-sync` hiện có —
   `.github/workflows/scheduled-jobs.yml`). Hệ quả:
   - Nhắc nhở gửi mỗi **~5 phút** (sàn thực tế của GitHub Actions cron), không phải
     ±1 phút. Mục B `calendar-reminders` không quy định độ chính xác giây/phút nên
     hợp đồng hành vi vẫn đạt.
   - `members/{uid}` đồng bộ từ `users` **lúc đăng nhập** (mở rộng
     `upsertUserProfile`) cộng job đối soát hằng đêm `/api/jobs/members-reconcile`,
     thay cho trigger `onWrite`.
   - "Trigger `onWrite calendarItems` → tính lại `dueReminders`" làm **trong route
     handler ghi mục** (`/api/calendar-items/**` + firebase-admin), không phải trigger.
   - Dọn `deletedAt` quá 30 ngày là job `/api/jobs/**` hằng ngày.
   - `firestore.rules` vẫn theo Mục C §6: client chỉ đọc, mọi ghi qua server.

3. **FCM push hoãn sang sau v1.** v1 chỉ chuông in-app. Model `dueReminders` vẫn giữ
   `channel: "inapp" | "push"` nhưng job gửi bỏ qua nhánh push; không dựng service
   worker, luồng xin quyền, `fcmTokens` ở v1. Task 10.7 và nhánh push của
   10.2 / 10.5 dời sang một PR sau.

4. **Ngưỡng `spanDays` → `isLongSpan` = 45** (mặc định Design §1).

5. **Khung nhìn Năm**: truy vấn trực tiếp `startDay` / `endDay` của `calendarItems`,
   gộp tập ngày ở client. KHÔNG dựng collection `dayCounts` và không có job cập nhật
   nó ở v1 (thêm sau nếu đo thấy chậm).

Ràng buộc hạ tầng repo khác:

- Làm trên nhánh git riêng `feat/team-activity-calendar` tách từ `main`. Không commit
  từ bản làm việc trong Google Drive.
- Thư viện thêm: `date-fns`, `rrule`, `@firebase/rules-unit-testing` (dev).
  `@dnd-kit/core` và `sonner` đã có. shadcn thêm: `Popover`, `Dialog`, `Command`,
  `Calendar`.
- `notifications` (chốt ở nhóm 9–10): KHÔNG dùng lại collection `notifications` của
  CPT (project/content-scoped, enum ở domain CPT không được chạm). Lịch có collection
  riêng **`calendarNotifications/{uid}/items`** (đúng hình dạng Mục C §1 phác) +
  chuông riêng `CalendarNotificationBell` trong toolbar lịch. Chỉ tái dùng *khuôn* UI
  của `src/modules/notifications`. Server-only writes; chính chủ đọc realtime.

---

# MỤC A — PROPOSAL

## Why

Trưởng phòng marketing cần một cái nhìn tổng quan về hoạt động, mục tiêu và nhiệm vụ của cả đội theo ngày / tuần / tháng / năm để quản lý và sắp xếp công việc; nhân sự cần một nơi duy nhất để biết mình phải làm gì và khi nào. Hiện chưa có lịch dùng chung — kế hoạch nằm rải rác trong Google Sheets/Docs và tin nhắn, không ai thấy được bức tranh chung theo thời gian.

Giải pháp: một lịch đội **hoạt động y hệt Google Calendar** (khung nhìn Ngày/Tuần/Tháng/Năm/Lịch biểu, tạo–kéo–thả, sự kiện lặp lại, nhắc nhở), bổ sung một trường riêng cho bối cảnh phòng marketing: **"Người đảm nhận"** trên mỗi mục.

## What Changes

- Thêm khái niệm **Lịch con (Calendar)** kiểu Google Calendar: mỗi thành viên có một lịch cá nhân, cộng các lịch dùng chung theo chủ đề (VD "Mục tiêu phòng", "Chiến dịch", "Nội dung", "Ads"). Mỗi lịch có màu; mỗi người tự chọn ẩn/hiện từng lịch, lựa chọn đó lưu theo người.
- Thêm **Mục lịch (Calendar Item)** — đơn vị hiển thị trên lịch — với một **nhãn loại**: `Mục tiêu` / `Hoạt động` / `Nhiệm vụ`. Cùng cấu trúc trường như sự kiện Google Calendar: tiêu đề, mô tả, địa điểm, thời gian bắt đầu/kết thúc, cả ngày / nhiều ngày, màu, lịch chứa nó, và (tuỳ chọn) liên kết tới một Dự án / hạng mục nội dung của hệ thống hiện có.
- Thêm **5 khung nhìn**: Ngày, Tuần (7 ngày), Tháng, Năm, Lịch biểu (danh sách theo ngày) — kèm bảng điều hướng mini-tháng, nút "Hôm nay / ‹ / ›", nhảy tới ngày bất kỳ, vạch giờ hiện tại, hàng "cả ngày", tràn ô "còn N mục", tuần bắt đầu thứ Hai, phím tắt (d/w/m/y/a, t).
- Thêm **thao tác trực tiếp như Google Calendar**: bấm ô trống để tạo nhanh, kéo trên lưới giờ để đặt khoảng thời gian, kéo thân mục để dời, kéo mép để đổi thời lượng, kéo trong khung Tháng để đổi ngày; hoàn tác thay đổi vừa rồi; nhân bản mục.
- Thêm **Sự kiện lặp lại**: hàng ngày / hàng tuần (chọn thứ) / hàng tháng / hàng năm / tuỳ chỉnh; kết thúc sau N lần, vào ngày, hoặc không bao giờ. Sửa/xoá một mục trong chuỗi hỏi rõ **"Chỉ mục này / Mục này và các mục sau / Tất cả"**; giữ nguyên các ngoại lệ đã chỉnh riêng.
- Thêm trường **"Người đảm nhận"**: chọn **nhiều** thành viên từ danh bạ đội, đánh dấu **một người phụ trách chính**. Hiển thị trên mục và trong ô chi tiết; lọc lịch theo người đảm nhận; khung nhìn nhanh "Việc của tôi". Người được giao là nhân sự thì có quyền sửa/hoàn thành mục đó.
- Thêm **Nhắc nhở**: mặc định theo từng lịch, ghi đè theo từng mục, nhiều mốc nhắc, kênh chuông in-app + tuỳ chọn đẩy (FCM); nhắc mục cả ngày theo giờ hẹn trước.
- Thêm **Đăng nhập + phân quyền** hai vai trò: **Trưởng phòng** (toàn quyền trên mọi mục và mọi lịch) và **Nhân sự** (xem tất cả; tạo mục; chỉ sửa/xoá mục mình tạo hoặc mình đảm nhận). Firestore Security Rules phản ánh đúng ma trận quyền.
- Thêm **Tìm kiếm và bộ lọc**: tìm theo tiêu đề/mô tả/địa điểm/người đảm nhận (kết quả dạng danh sách, bấm để nhảy tới); bộ lọc bền vững theo loại, lịch, người đảm nhận, dự án liên kết — kết hợp nhiều điều kiện.
- **Ngăn xếp kỹ thuật (đội đã chốt)**: frontend React + shadcn/ui + Tailwind CSS; backend Firebase — Firebase Auth (đăng nhập), Cloud Firestore (dữ liệu + realtime qua listener), Cloud Functions (giãn chuỗi lặp, lên lịch nhắc), Firebase Cloud Messaging (đẩy nhắc). Chi tiết ở `design.md`.

## Capabilities

### New Capabilities

- `team-calendar`: Quản lý lịch con (cá nhân + dùng chung, màu, ẩn/hiện theo người) và Mục lịch với nhãn loại `Mục tiêu`/`Hoạt động`/`Nhiệm vụ`, đầy đủ trường kiểu sự kiện Google Calendar, ô chi tiết + form soạn thảo, và liên kết tuỳ chọn tới Dự án / hạng mục nội dung.
- `calendar-views`: Năm khung nhìn Ngày/Tuần/Tháng/Năm/Lịch biểu với điều hướng mini-tháng, "Hôm nay/‹/›", nhảy ngày, vạch giờ hiện tại, hàng cả ngày, tràn ô "còn N mục", tuần bắt đầu thứ Hai, số tuần tuỳ chọn, phím tắt, và nhớ khung nhìn gần nhất.
- `calendar-item-editing`: Tạo và chỉnh sửa bằng thao tác trực tiếp — bấm ô trống tạo nhanh, kéo chọn khoảng, kéo dời, kéo mép đổi thời lượng, kéo đổi ngày ở khung Tháng, hoàn tác, nhân bản.
- `recurring-items`: Quy tắc lặp (ngày/tuần/tháng/năm/tuỳ chỉnh, điều kiện kết thúc), phạm vi khi sửa/xoá ("chỉ mục này / mục này và sau đó / tất cả"), và bảo toàn ngoại lệ của từng mục trong chuỗi.
- `item-assignees`: Trường "Người đảm nhận" nhiều người + một người phụ trách chính; hiển thị trên lịch, lọc theo người, khung nhìn "Việc của tôi", thông báo khi được giao, và quyền chỉnh sửa gắn với người được giao.
- `calendar-reminders`: Nhắc trước mục theo mặc định của lịch hoặc ghi đè theo mục, nhiều mốc, kênh in-app + đẩy FCM, nhắc mục cả ngày, đánh dấu đã đọc / bỏ nhắc.
- `calendar-access-control`: Đăng nhập Firebase Auth; hai vai trò Trưởng phòng / Nhân sự; ma trận quyền xem / tạo / sửa / xoá mục và quản lý danh sách lịch; lịch "chỉ Trưởng phòng ghi"; Firestore Security Rules tương ứng.
- `calendar-search-and-filter`: Ô tìm kiếm toàn lịch và bộ lọc bền vững (loại, lịch, người đảm nhận, dự án liên kết) kết hợp nhiều điều kiện, áp dụng cho mọi khung nhìn.

### Modified Capabilities

(không) — Thư mục `tasks-docs/openspec/specs/` hiện chưa có capability nào được archive. Các capability liên quan (`notifications`, `project-workspace` của `content-performance-tracker`; `task-assignment` của `enterprise-task-management`) vẫn ở dạng change in-progress, nên change này **tái dùng ở mức thiết kế** (cùng bảng `users`/vai trò, cùng danh bạ thành viên, cùng kênh thông báo) mà không tạo delta spec. Nếu các change đó được archive trước, bước `apply` sẽ nối `calendar-reminders`/`item-assignees` vào capability `notifications` đã có thay vì dựng kênh mới.

## Impact

- **Hệ thống hiện có**: tái dùng `users` (trường vai trò `system_role: manager | staff`) và danh bạ thành viên phòng marketing làm nguồn cho "Người đảm nhận" và phân quyền. Không đổi schema của Dự án / hạng mục nội dung; chỉ thêm liên kết một chiều (Mục lịch → Dự án/hạng mục) là tuỳ chọn.
- **Dữ liệu mới (Firestore collections)**: `calendars`, `calendarItems`, `recurrenceExceptions` (hoặc trường lồng), `reminders` (hoặc lồng trong item), `calendarItemAssignees` (hoặc mảng lồng), `userCalendarPrefs` (ẩn/hiện + màu ghi đè theo người). Chi tiết + lý do ở `design.md`.
- **Cloud Functions**: giãn chuỗi lặp thành các lần hiện (materialize) trong cửa sổ truy vấn; hàng đợi nhắc nhở theo lịch; fan-out thông báo "được giao việc".
- **Realtime**: dùng Firestore `onSnapshot` cho khung nhìn đang mở (thay cho WebSocket/SSE ở các change khác); không cần hạ tầng realtime riêng.
- **Bảo mật**: Firestore Security Rules cho ma trận quyền hai vai trò; FCM token lưu theo thiết bị của người dùng.
- **Ngoài phạm vi v1** (ghi ở `design.md`): lời mời khách + phản hồi RSVP, chia sẻ lịch ra ngoài phòng, đồng bộ Google Calendar hai chiều, múi giờ theo từng sự kiện (đội dùng một múi giờ `Asia/Ho_Chi_Minh`), khung nhìn "N ngày" tuỳ chỉnh, in ra PDF, đính kèm tệp.

---

# MỤC B — ĐẶC TẢ TỪNG CAPABILITY


## capability: `team-calendar`

## Purpose

Cung cấp lịch dùng chung của phòng marketing: quản lý các lịch con (cá nhân và theo chủ đề) và các Mục lịch (mục tiêu / hoạt động / nhiệm vụ) với cấu trúc trường giống sự kiện Google Calendar, để cả đội thấy chung kế hoạch theo thời gian.

## ADDED Requirements

### Requirement: Danh sách lịch con

Hệ thống SHALL quản lý nhiều "lịch con" (calendar). Mỗi lịch con có: tên (bắt buộc), màu (bắt buộc, chọn từ bảng màu định sẵn), mô tả (tuỳ chọn), và loại quyền ghi (`mọi người` hoặc `chỉ Trưởng phòng`). Khi khởi tạo hệ thống SHALL tự tạo một lịch cá nhân cho mỗi thành viên phòng và bốn lịch dùng chung mặc định: "Mục tiêu phòng", "Chiến dịch", "Nội dung", "Ads".

#### Scenario: Tạo lịch con mới

- **WHEN** Trưởng phòng nhập tên và chọn màu rồi lưu
- **THEN** hệ thống tạo lịch con rỗng, hiển thị nó trong danh sách lịch của mọi người ở trạng thái đang hiện

#### Scenario: Tạo lịch con thiếu tên hoặc màu

- **WHEN** người dùng lưu form tạo lịch mà chưa nhập tên hoặc chưa chọn màu
- **THEN** hệ thống từ chối lưu và chỉ rõ trường còn thiếu

#### Scenario: Mỗi thành viên có sẵn một lịch cá nhân

- **WHEN** một thành viên mới được thêm vào phòng marketing
- **THEN** hệ thống tạo cho người đó một lịch cá nhân mang tên họ, màu mặc định, quyền ghi `mọi người`

#### Scenario: Đổi tên và màu lịch con

- **WHEN** Trưởng phòng đổi tên hoặc màu của một lịch con
- **THEN** hệ thống lưu thay đổi và mọi mục thuộc lịch đó hiển thị theo màu mới ở lần tải kế tiếp của mọi người xem

### Requirement: Ẩn/hiện và màu ghi đè theo từng người

Hệ thống SHALL cho mỗi người dùng tự bật/tắt hiển thị từng lịch con và tự đặt màu ghi đè cho lịch con đó ở phía mình. Lựa chọn này SHALL lưu theo người và không ảnh hưởng người khác.

#### Scenario: Ẩn một lịch con

- **WHEN** người dùng bỏ chọn ô hiển thị của lịch "Ads"
- **THEN** các mục thuộc lịch "Ads" biến mất khỏi mọi khung nhìn của riêng người đó; người khác vẫn thấy bình thường

#### Scenario: Ghi đè màu ở phía mình

- **WHEN** người dùng đặt màu khác cho lịch "Nội dung" ở phía mình
- **THEN** chỉ màn hình của người đó dùng màu mới; màu do Trưởng phòng đặt vẫn là mặc định cho người chưa ghi đè

#### Scenario: Trạng thái ẩn/hiện được nhớ

- **WHEN** người dùng ẩn vài lịch con rồi đăng xuất và đăng nhập lại
- **THEN** đúng các lịch đó vẫn đang ẩn

### Requirement: Mục lịch và nhãn loại

Hệ thống SHALL cho phép tạo "Mục lịch" (calendar item) thuộc đúng một lịch con, với một nhãn loại bắt buộc là một trong `Mục tiêu`, `Hoạt động`, `Nhiệm vụ`. Mục lịch SHALL có các trường: tiêu đề (tuỳ chọn, mặc định hiển thị "(Không có tiêu đề)"), mô tả (tuỳ chọn), địa điểm (tuỳ chọn), thời gian bắt đầu và kết thúc, cờ "cả ngày", màu ghi đè tuỳ chọn (mặc định lấy theo lịch con), và liên kết tuỳ chọn tới một Dự án hoặc hạng mục nội dung của hệ thống hiện có.

#### Scenario: Tạo mục có thời gian trong ngày

- **WHEN** người dùng tạo mục loại `Hoạt động`, chọn lịch "Chiến dịch", đặt 09:00–10:30 một ngày cụ thể
- **THEN** hệ thống lưu mục và hiển thị nó ở đúng khoảng giờ đó trên khung nhìn Ngày và Tuần, màu theo lịch "Chiến dịch"

#### Scenario: Tạo mục cả ngày, nhiều ngày

- **WHEN** người dùng tạo mục loại `Mục tiêu` với cờ "cả ngày", từ ngày 1 đến ngày 31 của một tháng
- **THEN** hệ thống hiển thị mục dưới dạng dải kéo dài trong hàng "cả ngày" của khung Tuần và như một thanh trải nhiều ô ở khung Tháng

#### Scenario: Kết thúc trước bắt đầu

- **WHEN** người dùng đặt thời gian kết thúc sớm hơn thời gian bắt đầu
- **THEN** hệ thống từ chối lưu và báo lỗi khoảng thời gian không hợp lệ

#### Scenario: Mục không tiêu đề

- **WHEN** người dùng lưu mục mà không nhập tiêu đề
- **THEN** hệ thống vẫn tạo mục và hiển thị "(Không có tiêu đề)" ở mọi nơi cần tên

#### Scenario: Nhãn loại quyết định biểu tượng

- **WHEN** khung nhìn hiển thị các mục thuộc ba loại khác nhau
- **THEN** mỗi mục kèm một chỉ dấu loại (biểu tượng hoặc nhãn chữ) để phân biệt `Mục tiêu` / `Hoạt động` / `Nhiệm vụ` mà không cần mở chi tiết

### Requirement: Ô chi tiết và form soạn thảo mục

Hệ thống SHALL hiển thị một ô chi tiết (popover) khi người dùng bấm vào một mục, cho xem nhanh: tiêu đề, loại, thời gian, lịch con, người đảm nhận, địa điểm, mô tả, và liên kết Dự án/hạng mục nếu có. Từ ô chi tiết SHALL mở được form soạn thảo đầy đủ để sửa mọi trường.

#### Scenario: Xem nhanh một mục

- **WHEN** người dùng bấm một mục trên khung Tuần
- **THEN** hệ thống mở popover hiển thị đủ thông tin tóm tắt và các nút "Sửa", "Xoá", "Nhân bản" theo quyền của người đó

#### Scenario: Mở liên kết Dự án từ mục

- **WHEN** một mục có liên kết tới một Dự án và người dùng bấm vào liên kết đó trong popover
- **THEN** hệ thống mở trang Dự án tương ứng trong tab mới, không rời khỏi lịch

#### Scenario: Sửa trường và lưu

- **WHEN** người dùng mở form soạn thảo, đổi tiêu đề và giờ kết thúc rồi lưu
- **THEN** hệ thống lưu thay đổi và cập nhật mục trên mọi khung nhìn đang mở của mọi người trong vòng vài giây

### Requirement: Cập nhật thời gian thực

Hệ thống SHALL phản ánh việc tạo, sửa, xoá, di chuyển mục lịch tới mọi phiên đang mở cùng khung thời gian mà không cần tải lại trang.

#### Scenario: Hai người cùng xem một tuần

- **WHEN** người A tạo một mục mới trong tuần mà người B đang xem
- **THEN** mục đó xuất hiện trên màn hình người B trong vòng vài giây, đúng vị trí

#### Scenario: Mục bị xoá khi đang mở popover

- **WHEN** người B đang mở popover của một mục và người A xoá mục đó
- **THEN** hệ thống đóng popover của người B và báo ngắn gọn rằng mục đã bị xoá

---

## capability: `calendar-views`

## Purpose

Định nghĩa năm khung nhìn lịch (Ngày, Tuần, Tháng, Năm, Lịch biểu) và toàn bộ cơ chế điều hướng thời gian giống Google Calendar, để Trưởng phòng và nhân sự xem hoạt động của cả đội ở mọi mức độ chi tiết.

## ADDED Requirements

### Requirement: Năm khung nhìn

Hệ thống SHALL cung cấp năm khung nhìn: "Ngày", "Tuần" (7 ngày), "Tháng", "Năm", "Lịch biểu". Người dùng SHALL chuyển giữa các khung nhìn bằng bộ chọn trên thanh công cụ hoặc phím tắt, và hệ thống SHALL nhớ khung nhìn gần nhất cho lần mở sau.

#### Scenario: Chuyển sang khung nhìn Tuần

- **WHEN** người dùng chọn "Tuần" trên bộ chọn khung nhìn
- **THEN** hệ thống hiển thị 7 cột ngày (thứ Hai đến Chủ nhật) với lưới giờ dọc và giữ nguyên ngày đang chọn nằm trong tuần đó

#### Scenario: Nhớ khung nhìn gần nhất

- **WHEN** người dùng đang ở khung "Tháng" rồi tải lại trang
- **THEN** hệ thống mở lại ở khung "Tháng"

#### Scenario: Phím tắt đổi khung nhìn

- **WHEN** người dùng nhấn phím `d`, `w`, `m`, `y`, hoặc `a`
- **THEN** hệ thống chuyển tương ứng sang Ngày, Tuần, Tháng, Năm, Lịch biểu

### Requirement: Khung nhìn Ngày và Tuần

Khung Ngày và Tuần SHALL hiển thị lưới giờ dọc 24 giờ có thể cuộn, một hàng "cả ngày" cố định phía trên lưới, một vạch ngang chỉ giờ hiện tại trên cột ngày hôm nay, và các mục chồng giờ được xếp cạnh nhau chia đều bề ngang.

#### Scenario: Vạch giờ hiện tại

- **WHEN** người dùng mở khung Tuần có chứa ngày hôm nay
- **THEN** hệ thống vẽ một vạch ngang tại đúng giờ hiện tại trên cột hôm nay và tự cập nhật vị trí theo thời gian thực

#### Scenario: Nhiều mục trùng giờ

- **WHEN** ba mục cùng nằm trong khoảng 09:00–10:00 một ngày
- **THEN** hệ thống chia cột ngày đó thành ba khối cạnh nhau cho ba mục, không chồng đè lên nhau

#### Scenario: Mục cả ngày tách khỏi lưới giờ

- **WHEN** một ngày có cả mục cả ngày và mục theo giờ
- **THEN** mục cả ngày nằm ở hàng "cả ngày" phía trên, mục theo giờ nằm trong lưới giờ

#### Scenario: Cuộn tới giờ làm việc khi mở

- **WHEN** người dùng mở khung Ngày hoặc Tuần
- **THEN** lưới giờ cuộn sẵn tới khoảng 07:00–08:00 thay vì 00:00

### Requirement: Khung nhìn Tháng

Khung Tháng SHALL hiển thị lưới 6 hàng tuần, mỗi ô là một ngày, tuần bắt đầu từ thứ Hai. Mỗi ô SHALL hiển thị tối đa một số mục nhất định theo chiều cao ô; phần dư SHALL gộp thành liên kết "còn N mục" mở ra danh sách mục của ngày đó.

#### Scenario: Tràn ô ngày

- **WHEN** một ngày có 8 mục nhưng ô chỉ đủ chỗ cho 3
- **THEN** hệ thống hiển thị 3 mục đầu và một liên kết "còn 5 mục"; bấm vào liên kết mở danh sách đầy đủ mục của ngày đó

#### Scenario: Ngày ngoài tháng hiện tại

- **WHEN** lưới tháng bao gồm vài ngày của tháng trước và tháng sau để lấp đủ hàng
- **THEN** các ngày đó vẫn hiển thị mục nhưng được làm mờ để phân biệt với tháng đang xem

#### Scenario: Bấm vào một ngày

- **WHEN** người dùng bấm vào vùng trống của một ô ngày
- **THEN** hệ thống chuyển sang khung Ngày của ngày đó

### Requirement: Khung nhìn Năm

Khung Năm SHALL hiển thị 12 tháng thu nhỏ của năm đang chọn. Ngày có ít nhất một mục SHALL được đánh dấu. Khung Năm SHALL KHÔNG hiển thị chi tiết mục.

#### Scenario: Đánh dấu ngày có hoạt động

- **WHEN** người dùng mở khung Năm
- **THEN** mỗi ngày có mục được tô nền hoặc chấm màu; ngày không có mục để trống

#### Scenario: Bấm một ngày trong khung Năm

- **WHEN** người dùng bấm vào một ngày bất kỳ trong 12 tháng thu nhỏ
- **THEN** hệ thống chuyển sang khung Ngày của ngày đó

### Requirement: Khung nhìn Lịch biểu

Khung Lịch biểu SHALL liệt kê các mục theo thứ tự thời gian, gộp theo ngày, bỏ qua những ngày không có mục, và tải thêm khi cuộn tới cuối.

#### Scenario: Danh sách theo ngày

- **WHEN** người dùng mở khung Lịch biểu từ hôm nay
- **THEN** hệ thống hiển thị từng ngày có mục kèm danh sách mục trong ngày, ngày trống bị lược bỏ

#### Scenario: Tải thêm khi cuộn

- **WHEN** người dùng cuộn tới cuối danh sách Lịch biểu
- **THEN** hệ thống nạp tiếp khoảng thời gian sau đó và thêm vào cuối danh sách

### Requirement: Điều hướng thời gian

Hệ thống SHALL cung cấp nút "Hôm nay", nút lùi "‹" và tiến "›" (bước theo đơn vị của khung nhìn hiện tại), một bảng lịch mini-tháng để nhảy tới ngày bất kỳ, và hiển thị nhãn khoảng thời gian đang xem. Tuỳ chọn hiển thị số tuần SHALL có ở khung Tuần và Tháng.

#### Scenario: Nút lùi/tiến theo đơn vị khung nhìn

- **WHEN** người dùng đang ở khung Tuần và bấm "›"
- **THEN** hệ thống chuyển sang tuần kế tiếp; nếu đang ở khung Tháng thì bấm "›" chuyển sang tháng kế tiếp

#### Scenario: Nút Hôm nay

- **WHEN** người dùng đã điều hướng đi xa và bấm "Hôm nay"
- **THEN** hệ thống đưa khung nhìn về khoảng thời gian chứa ngày hiện tại

#### Scenario: Nhảy ngày bằng mini-tháng

- **WHEN** người dùng bấm một ngày trên bảng mini-tháng ở thanh bên
- **THEN** khung nhìn chính nhảy tới khoảng thời gian chứa ngày đó, giữ nguyên loại khung nhìn

#### Scenario: Bật số tuần

- **WHEN** người dùng bật tuỳ chọn "hiển thị số tuần"
- **THEN** khung Tuần và Tháng hiển thị số thứ tự tuần trong năm ở đầu mỗi hàng tuần

---

## capability: `calendar-item-editing`

## Purpose

Định nghĩa các thao tác tạo và chỉnh sửa mục lịch bằng thao tác trực tiếp trên lưới (bấm, kéo, thả) giống Google Calendar, để việc lên kế hoạch nhanh và trực quan.

## ADDED Requirements

### Requirement: Tạo nhanh bằng cách bấm ô trống

Hệ thống SHALL cho phép tạo mục bằng một cú bấm vào vùng trống của lưới: ở khung Ngày/Tuần tạo mục dài mặc định (VD 60 phút) bắt đầu tại khe giờ được bấm; ở khung Tháng tạo mục cả ngày cho ngày được bấm. Sau cú bấm hệ thống SHALL mở popover tạo nhanh chỉ yêu cầu tiêu đề, cho chọn lịch con và người đảm nhận, và có liên kết "Sửa thêm" mở form đầy đủ.

#### Scenario: Bấm khe giờ trên khung Tuần

- **WHEN** người dùng bấm vào khe 14:00 của một cột ngày
- **THEN** hệ thống mở popover tạo nhanh cho mục 14:00–15:00 ngày đó, con trỏ đặt sẵn ở ô tiêu đề

#### Scenario: Lưu nhanh chỉ với tiêu đề

- **WHEN** người dùng gõ tiêu đề trong popover tạo nhanh và nhấn Enter
- **THEN** hệ thống tạo mục vào lịch con mặc định của người đó với loại `Nhiệm vụ`, đóng popover

#### Scenario: Huỷ tạo nhanh

- **WHEN** người dùng mở popover tạo nhanh rồi nhấn Esc hoặc bấm ra ngoài mà chưa nhập gì
- **THEN** hệ thống đóng popover và không tạo mục nào

### Requirement: Kéo để chọn khoảng thời gian khi tạo

Hệ thống SHALL cho phép ấn giữ và kéo dọc trên lưới giờ để tạo mục có thời lượng đúng bằng khoảng đã kéo, bắt dính theo bước 15 phút.

#### Scenario: Kéo tạo mục 2 tiếng

- **WHEN** người dùng ấn tại 09:00 và kéo xuống tới 11:00 rồi thả
- **THEN** hệ thống mở popover tạo nhanh cho mục 09:00–11:00 ngày đó

#### Scenario: Bắt dính 15 phút

- **WHEN** người dùng thả chuột ở vị trí tương ứng 10:07
- **THEN** hệ thống làm tròn về 10:00 hoặc 10:15 (mốc gần nhất)

### Requirement: Kéo-thả để di chuyển mục

Hệ thống SHALL cho phép kéo thân một mục để dời nó: trên khung Ngày/Tuần đổi giờ (và đổi ngày nếu kéo sang cột khác) giữ nguyên thời lượng; trên khung Tháng đổi ngày giữ nguyên giờ. Chỉ người có quyền sửa mục đó mới kéo được.

#### Scenario: Kéo đổi giờ trong ngày

- **WHEN** người dùng kéo một mục 09:00–10:00 xuống vị trí 13:00
- **THEN** hệ thống lưu mục thành 13:00–14:00 cùng ngày và cập nhật realtime cho người xem khác

#### Scenario: Kéo sang ngày khác ở khung Tháng

- **WHEN** người dùng kéo một mục từ ô ngày 5 sang ô ngày 12 ở khung Tháng
- **THEN** hệ thống dời mục sang ngày 12, giữ nguyên giờ và thời lượng

#### Scenario: Không đủ quyền thì không kéo được

- **WHEN** một nhân sự cố kéo một mục mà mình không tạo và không đảm nhận
- **THEN** hệ thống không cho kéo và giữ mục ở nguyên vị trí

#### Scenario: Kéo một mục trong chuỗi lặp

- **WHEN** người dùng kéo một lần hiện của mục lặp
- **THEN** hệ thống hỏi phạm vi áp dụng ("chỉ mục này" / "mục này và các mục sau" / "tất cả") trước khi lưu

### Requirement: Kéo mép để đổi thời lượng

Hệ thống SHALL cho phép kéo mép trên hoặc mép dưới của một mục theo giờ để đổi thời gian bắt đầu hoặc kết thúc, bắt dính 15 phút, không cho kết thúc sớm hơn bắt đầu.

#### Scenario: Kéo dài mục thêm 30 phút

- **WHEN** người dùng kéo mép dưới của mục 09:00–10:00 xuống 10:30
- **THEN** hệ thống lưu mục thành 09:00–10:30

#### Scenario: Chặn thời lượng âm

- **WHEN** người dùng kéo mép trên xuống quá mép dưới
- **THEN** hệ thống dừng ở thời lượng tối thiểu 15 phút, không lưu giá trị âm

### Requirement: Hoàn tác thay đổi vừa thực hiện

Sau mỗi thao tác di chuyển, đổi thời lượng, tạo nhanh, hoặc xoá, hệ thống SHALL hiển thị thông báo ngắn có nút "Hoàn tác" trong một khoảng thời gian đủ để bấm.

#### Scenario: Hoàn tác một lần kéo

- **WHEN** người dùng kéo nhầm một mục rồi bấm "Hoàn tác" trên thông báo
- **THEN** hệ thống đưa mục về đúng thời gian trước khi kéo

#### Scenario: Hoàn tác một lần xoá

- **WHEN** người dùng xoá một mục rồi bấm "Hoàn tác"
- **THEN** hệ thống khôi phục lại mục cùng mọi trường và người đảm nhận

### Requirement: Nhân bản mục

Hệ thống SHALL cho phép nhân bản một mục thành một mục mới độc lập, sao chép mọi trường trừ chuỗi lặp, mở form soạn thảo của bản sao để người dùng chỉnh ngày giờ.

#### Scenario: Nhân bản một mục

- **WHEN** người dùng chọn "Nhân bản" trên popover chi tiết của một mục
- **THEN** hệ thống tạo một mục mới sao chép tiêu đề, loại, lịch con, người đảm nhận, mô tả, địa điểm; không sao chép quy tắc lặp; mở form soạn thảo bản sao

---

## capability: `recurring-items`

## Purpose

Cho phép một mục lịch lặp lại theo quy tắc (hàng ngày, hàng tuần, hàng tháng, hàng năm, tuỳ chỉnh) và xử lý việc sửa hoặc xoá từng lần hiện trong chuỗi giống Google Calendar.

## ADDED Requirements

### Requirement: Đặt quy tắc lặp

Hệ thống SHALL cho phép đặt quy tắc lặp cho một mục: không lặp (mặc định), hàng ngày, hàng tuần (chọn một hoặc nhiều thứ trong tuần), hàng tháng (theo ngày dương lịch hoặc theo "thứ N của tháng"), hàng năm, hoặc tuỳ chỉnh (mỗi N ngày/tuần/tháng). Điều kiện kết thúc SHALL là một trong: không bao giờ, sau N lần, hoặc vào một ngày cụ thể.

#### Scenario: Lặp hàng tuần vào thứ Hai và thứ Tư

- **WHEN** người dùng đặt mục lặp "hàng tuần" chọn thứ Hai và thứ Tư, kết thúc sau 10 lần
- **THEN** hệ thống sinh đúng 10 lần hiện vào các thứ Hai/thứ Tư kế tiếp và dừng

#### Scenario: Lặp hàng tháng theo "thứ N"

- **WHEN** người dùng đặt mục vào thứ Sáu đầu tiên của tháng, lặp "hàng tháng theo thứ N"
- **THEN** mỗi lần hiện rơi vào thứ Sáu đầu tiên của các tháng tiếp theo, không phải cùng ngày dương lịch

#### Scenario: Kết thúc vào ngày cụ thể

- **WHEN** người dùng đặt lặp hàng ngày kết thúc vào 31/12
- **THEN** hệ thống không sinh lần hiện nào sau 31/12

#### Scenario: Đổi mục đơn thành mục lặp

- **WHEN** người dùng mở một mục không lặp và thêm quy tắc lặp hàng tuần
- **THEN** hệ thống chuyển mục thành chuỗi lặp, lần hiện đầu tiên giữ nguyên ngày giờ cũ

### Requirement: Phạm vi khi sửa mục trong chuỗi

Khi người dùng sửa một lần hiện của mục lặp, hệ thống SHALL hỏi phạm vi áp dụng: "Chỉ mục này", "Mục này và các mục sau", hoặc "Tất cả các mục". Hệ thống SHALL áp thay đổi đúng theo phạm vi được chọn.

#### Scenario: Chỉ sửa một lần hiện

- **WHEN** người dùng đổi giờ của lần hiện ngày 10 và chọn "Chỉ mục này"
- **THEN** chỉ lần hiện ngày 10 đổi giờ; các lần khác giữ nguyên; lần hiện ngày 10 trở thành ngoại lệ của chuỗi

#### Scenario: Sửa mục này và các mục sau

- **WHEN** người dùng đổi địa điểm ở lần hiện ngày 15 và chọn "Mục này và các mục sau"
- **THEN** chuỗi bị tách: các lần từ ngày 15 trở đi dùng địa điểm mới, các lần trước ngày 15 giữ nguyên

#### Scenario: Sửa tất cả

- **WHEN** người dùng đổi tiêu đề và chọn "Tất cả các mục"
- **THEN** mọi lần hiện đổi tiêu đề, trừ những trường đã bị ghi đè riêng ở các ngoại lệ trước đó

### Requirement: Phạm vi khi xoá mục trong chuỗi

Khi người dùng xoá một lần hiện của mục lặp, hệ thống SHALL hỏi cùng ba phạm vi và xoá tương ứng.

#### Scenario: Xoá một lần hiện

- **WHEN** người dùng xoá lần hiện ngày 20 và chọn "Chỉ mục này"
- **THEN** lần hiện ngày 20 biến mất khỏi lịch; các lần khác của chuỗi vẫn còn

#### Scenario: Xoá từ một mốc trở đi

- **WHEN** người dùng chọn "Mục này và các mục sau" tại lần hiện ngày 20
- **THEN** hệ thống đặt điều kiện kết thúc của chuỗi ngay trước ngày 20; mọi lần từ ngày 20 trở đi biến mất

### Requirement: Bảo toàn ngoại lệ khi sửa chuỗi

Hệ thống SHALL giữ nguyên các lần hiện đã được chỉnh riêng (đổi giờ, đổi tiêu đề, hoặc đã xoá lẻ) khi sau đó chuỗi gốc bị sửa với phạm vi "Tất cả", trừ khi người dùng xác nhận muốn ghi đè các ngoại lệ.

#### Scenario: Ngoại lệ không bị đè khi sửa toàn chuỗi

- **WHEN** lần hiện ngày 10 đã được dời sang 16:00, và sau đó người dùng đổi giờ toàn chuỗi sang 08:00 với phạm vi "Tất cả"
- **THEN** hệ thống hỏi có ghi đè các lần đã chỉnh riêng không; nếu người dùng chọn không, lần hiện ngày 10 vẫn ở 16:00

### Requirement: Giãn chuỗi theo cửa sổ truy vấn

Hệ thống SHALL chỉ vật chất hoá (tạo bản ghi hiển thị) các lần hiện nằm trong khoảng thời gian đang được truy vấn hoặc trong một cửa sổ tương lai hợp lý, không sinh vô hạn lần hiện cho chuỗi "không bao giờ kết thúc".

#### Scenario: Chuỗi vô hạn vẫn hiển thị đúng

- **WHEN** người dùng mở khung Tháng của một tháng cách hiện tại 2 năm cho một mục lặp hàng ngày không có ngày kết thúc
- **THEN** hệ thống vẫn hiển thị đầy đủ lần hiện cho tháng đó

#### Scenario: Không phình dữ liệu

- **WHEN** một mục lặp hàng ngày không ngày kết thúc được tạo
- **THEN** hệ thống không lưu sẵn hàng nghìn bản ghi lần hiện; các lần hiện được sinh theo nhu cầu truy vấn

---

## capability: `item-assignees`

## Purpose

Bổ sung trường "Người đảm nhận" trên mỗi mục lịch — điểm khác biệt so với Google Calendar — để Trưởng phòng và nhân sự biết rõ ai chịu trách nhiệm cho từng hoạt động, mục tiêu, nhiệm vụ.

## ADDED Requirements

### Requirement: Gán nhiều người đảm nhận và một người phụ trách chính

Hệ thống SHALL cho phép mỗi mục lịch có không, một, hoặc nhiều "người đảm nhận" chọn từ danh bạ thành viên phòng marketing. Khi có từ một người trở lên, hệ thống SHALL cho đánh dấu đúng một người là "phụ trách chính"; nếu người dùng không chọn, người đảm nhận đầu tiên được thêm là phụ trách chính mặc định.

#### Scenario: Gán ba người đảm nhận

- **WHEN** người dùng mở form soạn thảo một mục và thêm ba thành viên vào ô "Người đảm nhận"
- **THEN** hệ thống lưu cả ba; người được thêm đầu tiên được đánh dấu phụ trách chính cho tới khi người dùng đổi

#### Scenario: Đổi người phụ trách chính

- **WHEN** người dùng bấm đánh dấu phụ trách chính lên người thứ hai
- **THEN** hệ thống chuyển nhãn phụ trách chính sang người đó, hai người còn lại vẫn là người đảm nhận

#### Scenario: Chọn người ngoài danh bạ

- **WHEN** người dùng gõ một cái tên không có trong danh bạ thành viên phòng
- **THEN** hệ thống không cho thêm và chỉ gợi ý các thành viên hợp lệ

#### Scenario: Gỡ hết người đảm nhận

- **WHEN** người dùng xoá toàn bộ người đảm nhận của một mục
- **THEN** hệ thống lưu mục ở trạng thái chưa có người đảm nhận và không còn ai là phụ trách chính

### Requirement: Hiển thị người đảm nhận trên lịch

Hệ thống SHALL hiển thị người đảm nhận ngay trên mục ở các khung nhìn (ít nhất là ảnh đại diện hoặc tên viết tắt của người phụ trách chính, kèm chỉ dấu "+N" nếu có thêm người) và hiển thị đầy đủ danh sách trong popover chi tiết, với người phụ trách chính đứng đầu.

#### Scenario: Chỉ dấu trên khung Tuần

- **WHEN** một mục có 3 người đảm nhận hiển thị trên khung Tuần
- **THEN** mục hiển thị ảnh đại diện người phụ trách chính và nhãn "+2"

#### Scenario: Danh sách đầy đủ trong popover

- **WHEN** người dùng mở popover chi tiết của mục đó
- **THEN** hệ thống liệt kê cả 3 người, người phụ trách chính ở đầu và có nhãn "phụ trách chính"

### Requirement: Lọc lịch theo người đảm nhận

Hệ thống SHALL cung cấp bộ lọc "Người đảm nhận" cho phép chọn một hoặc nhiều thành viên; khi bật, mọi khung nhìn chỉ hiển thị các mục có ít nhất một người đảm nhận nằm trong danh sách đã chọn. Bộ lọc SHALL bền vững qua các lần đổi khung nhìn và điều hướng thời gian trong cùng phiên.

#### Scenario: Lọc theo một người

- **WHEN** Trưởng phòng chọn lọc theo nhân sự "An"
- **THEN** mọi khung nhìn chỉ còn các mục mà An là người đảm nhận (chính hoặc phụ)

#### Scenario: Lọc theo nhiều người

- **WHEN** Trưởng phòng chọn lọc theo "An" và "Bình"
- **THEN** khung nhìn hiển thị các mục có An hoặc Bình là người đảm nhận

#### Scenario: Bộ lọc giữ nguyên khi đổi khung nhìn

- **WHEN** người dùng đang lọc theo "An" ở khung Tuần rồi chuyển sang khung Tháng
- **THEN** khung Tháng vẫn áp dụng cùng bộ lọc

### Requirement: Khung nhìn nhanh "Việc của tôi"

Hệ thống SHALL cung cấp một lối tắt "Việc của tôi" đặt bộ lọc người đảm nhận về đúng người đang đăng nhập, dùng được ở mọi khung nhìn.

#### Scenario: Bật Việc của tôi

- **WHEN** nhân sự đang đăng nhập bấm "Việc của tôi"
- **THEN** mọi khung nhìn chỉ hiển thị các mục mà người đó là người đảm nhận

#### Scenario: Tắt Việc của tôi

- **WHEN** người dùng bấm lại "Việc của tôi" để tắt
- **THEN** khung nhìn trở lại hiển thị theo các lịch con đang bật, không lọc theo người

### Requirement: Thông báo khi được giao hoặc gỡ khỏi mục

Khi một người được thêm làm người đảm nhận của một mục, hệ thống SHALL gửi cho người đó một thông báo in-app kèm liên kết mở mục. Khi một người bị gỡ khỏi người đảm nhận, hệ thống SHALL gửi thông báo tương ứng. Người tự thêm chính mình SHALL KHÔNG nhận thông báo cho hành động đó.

#### Scenario: Được giao một mục

- **WHEN** Trưởng phòng thêm nhân sự "An" vào người đảm nhận của một mục
- **THEN** "An" nhận một thông báo "Bạn được giao: <tiêu đề mục>" với liên kết mở mục trên lịch

#### Scenario: Bị gỡ khỏi mục

- **WHEN** Trưởng phòng gỡ "An" khỏi người đảm nhận của mục đó
- **THEN** "An" nhận thông báo "Bạn không còn đảm nhận: <tiêu đề mục>"

#### Scenario: Tự nhận không tạo thông báo thừa

- **WHEN** nhân sự "An" tự thêm mình vào một mục
- **THEN** hệ thống không gửi thông báo "được giao" cho chính "An"

### Requirement: Quyền chỉnh sửa gắn với người đảm nhận

Một nhân sự là người đảm nhận (chính hoặc phụ) của một mục SHALL có quyền sửa mọi trường của mục đó và xoá mục đó, kể cả khi không phải người tạo. Chi tiết ma trận quyền ở capability `calendar-access-control`.

#### Scenario: Người đảm nhận sửa mục do người khác tạo

- **WHEN** nhân sự "An" là người đảm nhận một mục do Trưởng phòng tạo, và "An" đổi giờ mục
- **THEN** hệ thống lưu thay đổi

---

## capability: `calendar-reminders`

## Purpose

Cho phép mỗi mục lịch nhắc người liên quan trước khi tới giờ, theo mặc định của lịch con hoặc ghi đè theo từng mục, qua chuông in-app và tuỳ chọn đẩy thông báo, giống Google Calendar.

## ADDED Requirements

### Requirement: Mốc nhắc mặc định theo lịch con

Mỗi lịch con SHALL có một tập mốc nhắc mặc định do Trưởng phòng đặt (VD "10 phút trước" cho mục theo giờ, "09:00 ngày hôm trước" cho mục cả ngày). Mục mới tạo trong lịch con SHALL kế thừa các mốc nhắc mặc định đó.

#### Scenario: Kế thừa mốc nhắc mặc định

- **WHEN** lịch "Chiến dịch" có mốc nhắc mặc định "30 phút trước" và người dùng tạo một mục theo giờ trong lịch đó
- **THEN** mục mới có sẵn một mốc nhắc "30 phút trước" mà không cần đặt tay

#### Scenario: Đổi mặc định không ảnh hưởng mục cũ

- **WHEN** Trưởng phòng đổi mốc nhắc mặc định của lịch "Chiến dịch" từ "30 phút" sang "1 giờ"
- **THEN** các mục đã tạo trước đó giữ nguyên mốc nhắc cũ; chỉ mục tạo sau mới kế thừa "1 giờ"

### Requirement: Ghi đè mốc nhắc theo từng mục

Hệ thống SHALL cho phép thêm, sửa, xoá các mốc nhắc riêng cho một mục, tối đa một số lượng hợp lý (VD 5 mốc). Mỗi mốc nhắc SHALL định nghĩa bằng khoảng thời gian trước giờ bắt đầu (phút/giờ/ngày/tuần) và kênh gửi (in-app, hoặc in-app + đẩy).

#### Scenario: Thêm mốc nhắc thứ hai

- **WHEN** người dùng thêm mốc nhắc "1 ngày trước" cho một mục vốn đã có "10 phút trước"
- **THEN** hệ thống lưu cả hai mốc; mục sẽ nhắc hai lần

#### Scenario: Xoá hết mốc nhắc

- **WHEN** người dùng xoá toàn bộ mốc nhắc của một mục
- **THEN** hệ thống lưu mục ở trạng thái không nhắc, kể cả khi lịch con có mặc định

#### Scenario: Vượt số mốc tối đa

- **WHEN** người dùng cố thêm mốc nhắc thứ sáu
- **THEN** hệ thống từ chối và báo đã đạt số mốc nhắc tối đa

### Requirement: Người nhận nhắc

Hệ thống SHALL gửi nhắc của một mục tới tất cả người đảm nhận của mục đó và tới người tạo mục. Nếu mục không có người đảm nhận, chỉ người tạo nhận nhắc.

#### Scenario: Nhắc tới người đảm nhận

- **WHEN** tới mốc "10 phút trước" của một mục có hai người đảm nhận
- **THEN** cả hai người đảm nhận và người tạo đều nhận một nhắc

#### Scenario: Mục không người đảm nhận

- **WHEN** tới mốc nhắc của một mục chưa gán ai
- **THEN** chỉ người tạo mục nhận nhắc

### Requirement: Gửi nhắc qua chuông in-app và đẩy

Hệ thống SHALL luôn tạo một mục thông báo in-app (chuông, badge chưa đọc) tại mỗi mốc nhắc. Nếu mốc nhắc chọn kênh đẩy và người nhận đã cho phép thông báo đẩy trên thiết bị, hệ thống SHALL gửi thêm một thông báo đẩy.

#### Scenario: Nhắc in-app

- **WHEN** tới mốc nhắc và người nhận đang mở ứng dụng
- **THEN** chuông tăng badge chưa đọc và hiển thị nhắc với tiêu đề mục, thời gian, và nút mở mục

#### Scenario: Nhắc đẩy khi không mở ứng dụng

- **WHEN** mốc nhắc chọn kênh đẩy, người nhận đã cấp quyền đẩy, và không mở ứng dụng
- **THEN** người nhận nhận một thông báo đẩy trên thiết bị; bấm vào mở đúng mục trên lịch

#### Scenario: Chưa cấp quyền đẩy

- **WHEN** mốc nhắc chọn kênh đẩy nhưng người nhận chưa cấp quyền đẩy
- **THEN** hệ thống vẫn tạo nhắc in-app và không báo lỗi cho người gửi

### Requirement: Đánh dấu đã đọc và bỏ nhắc

Hệ thống SHALL cho người nhận đánh dấu một nhắc là đã đọc, và cho "bỏ nhắc" (snooze) để nhận lại sau một khoảng thời gian chọn nhanh (VD 5 phút, 30 phút, 1 giờ).

#### Scenario: Bỏ nhắc 30 phút

- **WHEN** người nhận bấm "bỏ nhắc 30 phút" trên một nhắc
- **THEN** hệ thống ẩn nhắc hiện tại và gửi lại một nhắc mới sau 30 phút

#### Scenario: Nhắc quá giờ vẫn hiển thị

- **WHEN** người nhận không xử lý một nhắc và giờ bắt đầu của mục đã trôi qua
- **THEN** nhắc vẫn nằm trong danh sách chưa đọc cho tới khi người nhận đánh dấu đã đọc

### Requirement: Nhắc bám theo khi mục đổi giờ

Khi một mục bị dời giờ bắt đầu, hệ thống SHALL tính lại thời điểm gửi cho mọi mốc nhắc chưa gửi của mục đó.

#### Scenario: Dời mục làm dời nhắc

- **WHEN** một mục 15:00 có nhắc "10 phút trước" (dự kiến 14:50) bị dời sang 17:00
- **THEN** nhắc được lên lịch lại vào 16:50; nếu 14:50 chưa tới thì không có nhắc nào bị gửi nhầm

---

## capability: `calendar-access-control`

## Purpose

Định nghĩa đăng nhập và phân quyền hai vai trò (Trưởng phòng, Nhân sự) cho lịch đội: ai xem được gì, ai tạo/sửa/xoá mục nào, ai quản lý danh sách lịch con — và ràng buộc tương ứng ở tầng dữ liệu.

## ADDED Requirements

### Requirement: Đăng nhập bắt buộc

Hệ thống SHALL yêu cầu đăng nhập bằng tài khoản của hệ thống marketing hiện có trước khi xem hoặc thao tác bất kỳ nội dung lịch nào. Người chưa đăng nhập SHALL bị chuyển tới màn hình đăng nhập.

#### Scenario: Truy cập khi chưa đăng nhập

- **WHEN** người dùng chưa đăng nhập mở một đường dẫn bất kỳ của lịch
- **THEN** hệ thống chuyển tới màn hình đăng nhập và sau khi đăng nhập thành công đưa về đúng đường dẫn ban đầu

#### Scenario: Tài khoản không thuộc phòng marketing

- **WHEN** một người đăng nhập bằng tài khoản hợp lệ nhưng không nằm trong danh bạ thành viên phòng marketing
- **THEN** hệ thống từ chối truy cập lịch và hiển thị thông báo không có quyền

### Requirement: Hai vai trò

Hệ thống SHALL nhận vai trò của người dùng từ trường vai trò sẵn có của hệ thống marketing: "Trưởng phòng" (`manager`) hoặc "Nhân sự" (`staff`). Vai trò SHALL KHÔNG chỉnh được trong phạm vi lịch này.

#### Scenario: Đọc vai trò từ hệ thống hiện có

- **WHEN** một người dùng có vai trò `manager` ở hệ thống marketing mở lịch
- **THEN** hệ thống áp cho người đó mọi quyền của Trưởng phòng mà không cần cấu hình riêng

### Requirement: Ma trận quyền trên mục lịch

Hệ thống SHALL áp dụng quyền như sau:

- Xem mọi mục trong các lịch con đang hiện: cả Trưởng phòng và Nhân sự.
- Tạo mục: cả Trưởng phòng và Nhân sự (trong các lịch con mà họ được ghi — xem yêu cầu về lịch "chỉ Trưởng phòng ghi").
- Sửa và xoá một mục: Trưởng phòng với mọi mục; Nhân sự chỉ với mục do chính mình tạo hoặc mình là người đảm nhận.
- Đổi lịch con của một mục sang một lịch "chỉ Trưởng phòng ghi": chỉ Trưởng phòng.

#### Scenario: Nhân sự sửa mục của người khác mà mình không đảm nhận

- **WHEN** một Nhân sự cố sửa hoặc xoá một mục do người khác tạo và mình không phải người đảm nhận
- **THEN** hệ thống từ chối với lỗi không đủ quyền

#### Scenario: Nhân sự xoá mục mình tạo

- **WHEN** một Nhân sự xoá một mục do chính mình tạo
- **THEN** hệ thống cho phép và xoá mục

#### Scenario: Trưởng phòng sửa mọi mục

- **WHEN** Trưởng phòng sửa một mục do một Nhân sự tạo
- **THEN** hệ thống cho phép

#### Scenario: Nhân sự xem toàn bộ lịch đội

- **WHEN** một Nhân sự mở khung Tháng
- **THEN** hệ thống hiển thị mọi mục của mọi người trong các lịch con đang hiện, kể cả mục người đó không liên quan

### Requirement: Quản lý danh sách lịch con giới hạn cho Trưởng phòng

Hệ thống SHALL chỉ cho Trưởng phòng tạo, đổi tên, đổi màu mặc định, đặt mốc nhắc mặc định, đặt quyền ghi, lưu trữ, hoặc xoá một lịch con. Nhân sự SHALL chỉ ẩn/hiện và ghi đè màu ở phía mình.

#### Scenario: Nhân sự cố tạo lịch con

- **WHEN** một Nhân sự cố tạo hoặc xoá một lịch con
- **THEN** hệ thống từ chối với lỗi không đủ quyền

#### Scenario: Xoá lịch con còn chứa mục

- **WHEN** Trưởng phòng xoá một lịch con đang chứa các mục
- **THEN** hệ thống yêu cầu xác nhận và cho chọn: chuyển các mục sang một lịch con khác, hoặc xoá luôn các mục đó

### Requirement: Lịch con "chỉ Trưởng phòng ghi"

Một lịch con đặt quyền ghi "chỉ Trưởng phòng" SHALL cho mọi người xem nhưng chỉ Trưởng phòng tạo/sửa/xoá mục trong đó. Lịch "Mục tiêu phòng" SHALL mặc định ở chế độ này.

#### Scenario: Nhân sự tạo mục trong lịch chỉ-đọc-với-mình

- **WHEN** một Nhân sự chọn lịch "Mục tiêu phòng" khi tạo mục
- **THEN** hệ thống không cho chọn lịch đó, hoặc từ chối lưu với lỗi không đủ quyền

#### Scenario: Nhân sự vẫn xem được mục tiêu phòng

- **WHEN** một Nhân sự mở lịch và bật hiển thị lịch "Mục tiêu phòng"
- **THEN** hệ thống hiển thị đầy đủ các mục tiêu trong đó ở chế độ chỉ đọc

### Requirement: Ràng buộc quyền ở tầng dữ liệu

Hệ thống SHALL thực thi toàn bộ ma trận quyền trên ở tầng dữ liệu (quy tắc bảo mật của kho dữ liệu), không chỉ ở giao diện, để một yêu cầu ghi trực tiếp không qua giao diện vẫn bị chặn đúng.

#### Scenario: Ghi trực tiếp vượt quyền bị chặn

- **WHEN** một client gửi yêu cầu ghi sửa một mục mà người dùng hiện tại không có quyền sửa
- **THEN** tầng dữ liệu từ chối ghi, độc lập với việc giao diện có hiển thị nút "Sửa" hay không

#### Scenario: Đọc mục của lịch đang ẩn

- **WHEN** người dùng đã ẩn một lịch con ở phía mình nhưng client vẫn truy vấn mục của lịch đó
- **THEN** tầng dữ liệu vẫn cho đọc (ẩn/hiện là lựa chọn hiển thị, không phải ranh giới bảo mật); mọi thành viên phòng đều có quyền đọc mọi lịch con

---

## capability: `calendar-search-and-filter`

## Purpose

Cung cấp ô tìm kiếm toàn lịch và các bộ lọc bền vững (loại, lịch con, người đảm nhận, dự án liên kết) để nhanh chóng khoanh vùng đúng hoạt động, mục tiêu, nhiệm vụ cần xem.

## ADDED Requirements

### Requirement: Tìm kiếm toàn lịch

Hệ thống SHALL cung cấp một ô tìm kiếm khớp trên tiêu đề, mô tả, địa điểm, và tên người đảm nhận của mục. Kết quả SHALL hiển thị dạng danh sách theo thời gian (gần hiện tại trước), mỗi dòng ghi tiêu đề, ngày giờ, lịch con, người đảm nhận; bấm một dòng đưa khung nhìn tới mục đó.

#### Scenario: Tìm theo từ khoá trong tiêu đề

- **WHEN** người dùng gõ "ra mắt" vào ô tìm kiếm
- **THEN** hệ thống liệt kê mọi mục có "ra mắt" trong tiêu đề, mô tả hoặc địa điểm, sắp theo thời gian

#### Scenario: Tìm theo tên người đảm nhận

- **WHEN** người dùng gõ tên một thành viên
- **THEN** kết quả bao gồm các mục mà thành viên đó là người đảm nhận

#### Scenario: Mở một kết quả

- **WHEN** người dùng bấm một dòng kết quả nằm ở tháng sau
- **THEN** hệ thống chuyển khung nhìn tới ngày của mục đó và mở popover chi tiết của mục

#### Scenario: Không có kết quả

- **WHEN** từ khoá không khớp mục nào
- **THEN** hệ thống hiển thị trạng thái rỗng "không tìm thấy mục nào", không phải danh sách trống không giải thích

### Requirement: Bộ lọc bền vững

Hệ thống SHALL cung cấp các bộ lọc: theo loại (`Mục tiêu` / `Hoạt động` / `Nhiệm vụ`), theo lịch con, theo người đảm nhận, theo dự án liên kết. Nhiều bộ lọc SHALL kết hợp theo phép AND. Trạng thái lọc SHALL hiển thị rõ ràng và bền vững khi đổi khung nhìn và điều hướng thời gian trong cùng phiên.

#### Scenario: Lọc theo loại

- **WHEN** người dùng bật lọc chỉ hiện `Mục tiêu`
- **THEN** mọi khung nhìn ẩn các mục loại `Hoạt động` và `Nhiệm vụ`

#### Scenario: Kết hợp lọc loại và người đảm nhận

- **WHEN** người dùng bật lọc `Nhiệm vụ` và người đảm nhận "An"
- **THEN** khung nhìn chỉ hiển thị các mục vừa là `Nhiệm vụ` vừa có "An" là người đảm nhận

#### Scenario: Lọc theo dự án liên kết

- **WHEN** người dùng chọn lọc theo dự án "Chiến dịch UGC tháng 8"
- **THEN** khung nhìn chỉ hiển thị các mục có liên kết tới dự án đó

#### Scenario: Chỉ báo và xoá bộ lọc

- **WHEN** đang có hai bộ lọc bật
- **THEN** hệ thống hiển thị số bộ lọc đang áp dụng và một nút "xoá tất cả bộ lọc" đưa lịch về hiển thị đầy đủ theo các lịch con đang bật

#### Scenario: Bộ lọc và ẩn/hiện lịch con cùng tác dụng

- **WHEN** người dùng vừa ẩn lịch "Ads" vừa bật lọc loại `Mục tiêu`
- **THEN** khung nhìn chỉ hiển thị mục loại `Mục tiêu` không thuộc lịch "Ads"

### Requirement: Tương tác giữa bộ lọc và tìm kiếm

Kết quả tìm kiếm SHALL bỏ qua trạng thái ẩn/hiện lịch con và các bộ lọc đang bật (tìm trên toàn bộ mục người dùng có quyền xem), nhưng SHALL ghi chú rõ khi một kết quả đang bị bộ lọc hiện tại ẩn khỏi khung nhìn.

#### Scenario: Kết quả nằm ngoài bộ lọc hiện tại

- **WHEN** người dùng đang lọc loại `Mục tiêu` và tìm một từ khoá khớp một mục loại `Nhiệm vụ`
- **THEN** mục `Nhiệm vụ` đó vẫn xuất hiện trong danh sách kết quả, kèm ghi chú rằng nó đang bị bộ lọc ẩn; mở nó sẽ nhắc người dùng nới bộ lọc để thấy trên khung nhìn

---

# MỤC C — DESIGN (HOW)

## Context

Xem `proposal.md` — phần "Why" và "What Changes" — cho động cơ và phạm vi.

Trạng thái hiện tại và ràng buộc định hình thiết kế:

- **Ngăn xếp đã chốt với đội**: frontend React + shadcn/ui + Tailwind CSS; backend Firebase (Firebase Auth, Cloud Firestore, Cloud Functions, Firebase Cloud Messaging). Các change khác trong `tasks-docs/openspec` cố tình không chốt tech stack; change này chốt vì đội đã chạy trên Firebase.
- Đã có tài khoản người dùng và danh bạ thành viên phòng marketing với trường vai trò `system_role: manager | staff`. Change này **đọc lại** dữ liệu đó, không dựng hệ thống nhân sự mới.
- Đội dùng **một múi giờ** `Asia/Ho_Chi_Minh` (không có DST) — không cần múi giờ theo từng sự kiện.
- Quy mô: một phòng (~10–40 người), ước lượng vài trăm mục lịch mỗi tháng. Không cần shard, không cần hạ tầng realtime riêng — `onSnapshot` của Firestore đủ.
- Firebase project ở gói Blaze (đã có Cloud Functions) — được phép dùng scheduled functions và FCM.

## Goals / Non-Goals

**Goals (mức thiết kế):**

- Mô hình dữ liệu Firestore đủ cho 8 capability, tối ưu cho truy vấn theo **khoảng thời gian đang xem** + **tập lịch con đang hiện**.
- Chiến lược truy vấn xử lý được cả mục ngắn theo giờ lẫn mục mục-tiêu trải dài nhiều tuần/tháng, trong giới hạn truy vấn của Firestore (không so sánh bất đẳng thức trên hai trường).
- Sự kiện lặp lại không phình dữ liệu: quy tắc lưu ở bản gốc, các lần hiện được sinh khi đọc.
- Nhắc nhở đáng tin: đúng giờ ± 1 phút, bám theo khi mục đổi giờ, không gửi trùng.
- Quy tắc bảo mật Firestore thực thi đầy đủ ma trận quyền hai vai trò — không phụ thuộc giao diện.
- Realtime cho khung nhìn đang mở mà không kéo về toàn bộ lịch.

**Non-Goals (mức thiết kế):**

- Không tự viết thư viện quy tắc lặp — dùng `rrule` (chuẩn iCalendar RFC 5545).
- Không đồng bộ hai chiều với Google Calendar, không import/export `.ics` ở v1.
- Không offline-first / ghi khi mất mạng ngoài phần Firestore tự lo.
- Không phân tích/dashboard số liệu (đó là việc của capability `progress-analytics` ở change khác).
- Không dựng lại kênh thông báo nếu capability `notifications` của `content-performance-tracker` được archive trước — khi đó nối vào kênh đó.

## Decisions

### 1. Mô hình dữ liệu Firestore

Collections (tên số nhiều, `camelCase` cho trường, timestamp là `Timestamp` của Firestore):

```text
config/calendarSettings
  timezone: "Asia/Ho_Chi_Minh"
  weekStartsOn: 1                 // thứ Hai
  defaultView: "week"

members/{uid}                     // BẢN SAO đọc-nhanh của danh bạ phòng marketing
  displayName, photoURL
  role: "manager" | "staff"       // đồng bộ từ system_role
  active: boolean
  // được một Cloud Function giữ đồng bộ từ collection người dùng gốc

calendars/{calendarId}
  name: string
  color: string                   // khoá bảng màu, vd "tomato"
  description: string | null
  kind: "personal" | "shared"
  ownerUid: string | null         // với kind personal
  writeScope: "everyone" | "managerOnly"
  defaultReminders: Reminder[]     // [{ offsetMinutes: 10, channel: "inapp" }, ...]
  archived: boolean
  createdAt, updatedAt

userCalendarPrefs/{uid}
  hidden: string[]                // calendarId đang ẩn ở phía người này
  colorOverrides: { [calendarId]: string }

calendarItems/{itemId}
  calendarId: string
  type: "goal" | "activity" | "task"        // Mục tiêu / Hoạt động / Nhiệm vụ
  title: string                              // "" => hiển thị "(Không có tiêu đề)"
  description: string | null
  location: string | null
  allDay: boolean
  startAt: Timestamp                          // với allDay: 00:00 giờ VN của ngày bắt đầu
  endAt: Timestamp                            // loại trừ; với allDay: 00:00 ngày sau ngày kết thúc
  startDay: "YYYY-MM-DD"                      // theo giờ VN, để truy vấn/hiển thị
  endDay: "YYYY-MM-DD"
  spanDays: number                           // = số ngày lịch item chạm tới
  dayKeys: string[] | null                   // mọi ngày item chạm tới, CHỈ khi spanDays <= 45; ngược lại null
  isLongSpan: boolean                         // spanDays > 45
  colorOverride: string | null
  assigneeIds: string[]                       // uid, mảng (có thể rỗng)
  primaryAssigneeId: string | null
  linkedProjectId: string | null
  linkedContentItemId: string | null
  reminders: Reminder[]                       // đã chốt cho mục này (kế thừa từ calendar khi tạo)
  recurrence: RRuleString | null             // vd "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"
  recurrenceId: string | null                // = itemId của bản gốc nếu đây là nhánh tách ra
  createdBy: string
  createdAt, updatedAt
  deletedAt: Timestamp | null                // xoá mềm, phục vụ Hoàn tác; dọn sau 30 ngày

calendarItems/{masterItemId}/exceptions/{originalDateKey}
  // ghi đè cho MỘT lần hiện của chuỗi lặp
  action: "modified" | "cancelled"
  overrides: Partial<CalendarItem>           // các trường bị đổi riêng
  originalStartAt: Timestamp

dueReminders/{reminderId}                     // hàng đợi nhắc, xem Quyết định 5
  itemId, occurrenceKey, recipientUids: string[]
  sendAt: Timestamp
  channel: "inapp" | "push"
  status: "pending" | "sent" | "cancelled"
  title, startAt                              // ảnh chụp để hiển thị kể cả khi item đổi

notifications/{uid}/items/{notifId}           // chuông in-app; TÁI DÙNG nếu đã có capability notifications
  type: "assigned" | "unassigned" | "reminder"
  itemId, message, createdAt, readAt

fcmTokens/{uid}/tokens/{tokenId}
  token, platform, updatedAt
```

`Reminder = { offsetMinutes: number, channel: "inapp" | "push" }`. Mục cả ngày: `offsetMinutes` tính từ `startAt` (00:00 VN), nên "09:00 ngày hôm trước" = `offsetMinutes: 900`.

**Lý do các lựa chọn chính:**

- **`dayKeys` cho mục ngắn, `isLongSpan` cho mục dài.** Firestore không cho lọc bất đẳng thức hai trường (`startAt` và `endAt`), nên không truy vấn trực tiếp "mục chồng lấn khoảng đang xem". Giải pháp: mục có `spanDays <= 45` lưu mảng `dayKeys` mọi ngày nó chạm tới → truy vấn khung nhìn bằng `array-contains-any` trên các ngày đang hiển thị. Mục dài hơn 45 ngày (hầu hết là `goal` cả năm/cả quý) đặt `isLongSpan: true`; client tải **toàn bộ** long-span của phòng (N nhỏ, vài chục) một lần và tự lọc chồng lấn. Cân bằng giữa chi phí ghi (mảng `dayKeys` giới hạn 45 phần tử) và chi phí đọc.
- **Xoá mềm (`deletedAt`) thay vì xoá thật** để nút "Hoàn tác" trên snackbar khôi phục nguyên vẹn; Cloud Function theo lịch dọn bản ghi `deletedAt` quá 30 ngày.
- **Người đảm nhận denormalized thẳng vào item** (`assigneeIds` mảng + `primaryAssigneeId`). `where('assigneeIds','array-contains',uid)` kết hợp một range trên `startAt` là truy vấn hợp lệ → "Việc của tôi" không cần bảng mirror.
- **Bản sao `members/{uid}`** để quy tắc bảo mật đọc vai trò bằng `get()` rẻ và để client render tên/ảnh người đảm nhận không phải join sang hệ thống người dùng gốc.
- **`exceptions` là subcollection của bản gốc**, khoá theo `originalDateKey` (ngày gốc của lần hiện) → sửa/xoá một lần hiện là một ghi idempotent; giãn chuỗi ở client chỉ cần đọc thêm subcollection này.

**Composite indexes cần tạo** (`firestore.indexes.json`):

- `calendarItems`: `calendarId ASC, startDay ASC` ; `dayKeys ARRAY, calendarId ASC` ; `assigneeIds ARRAY, startAt ASC` ; `isLongSpan ASC, endDay ASC` ; tất cả kèm điều kiện ngầm `deletedAt == null` (thêm `deletedAt ASC` vào từng index).
- `dueReminders`: `status ASC, sendAt ASC`.

### 2. Chiến lược truy vấn khung nhìn

Client tính khoảng ngày hiển thị (vd khung Tháng = 42 ngày), rồi chạy song song:

1. **Mục ngắn**: chia danh sách ngày thành lô ≤ 30, mỗi lô một truy vấn `dayKeys array-contains-any [..] where deletedAt == null`. Lọc thêm `calendarId in visibleCalendars` ở client (vì đã dùng array-contains).
2. **Mục dài**: `where isLongSpan == true where endDay >= windowStart where deletedAt == null`, client lọc `startDay <= windowEnd`.
3. **Chuỗi lặp**: bản gốc có `recurrence != null` được tải nếu `startDay <= windowEnd` (RRULE `UNTIL`/`COUNT` xử lý ở client bằng `rrule`), cộng subcollection `exceptions`. Client sinh các lần hiện trong khoảng đang xem.

Bộ lọc theo **loại** và **người đảm nhận** áp ở client trên tập kết quả đã thu hẹp theo thời gian — rẻ, và tránh đụng giới hạn "một array-contains + một in + một range" của Firestore.

Khung Năm: không tải item; chạy truy vấn tổng hợp nhẹ trả về **tập ngày có ít nhất một mục** (đọc `startDay`/`endDay`, hoặc một collection đếm theo ngày `dayCounts/{YYYY-MM-DD}` do Cloud Function cập nhật — chọn `dayCounts` nếu khung Năm chậm).

**Realtime**: mỗi truy vấn khung nhìn gắn `onSnapshot`; khi người dùng đổi khoảng thời gian hoặc bật/tắt lịch con thì huỷ listener cũ, mở listener mới. Không có listener toàn cục.

**Thay thế đã cân nhắc:** Cloud Function vật chất hoá mọi lần hiện lặp thành document thật. Bị loại: chi phí ghi lớn, khó sửa "tất cả các mục", và chuỗi vô hạn cần cắt cửa sổ tuỳ tiện. Client-side expansion bằng `rrule` là chuẩn và đủ nhanh cho quy mô này.

### 3. Giao diện & thư viện

- **Lưới giờ (khung Ngày/Tuần)**: tự dựng bằng CSS grid + Tailwind — không có component shadcn sẵn cho lưới lịch. Định vị mục bằng `top`/`height` theo phút; xếp mục chồng giờ bằng thuật toán phân làn (interval graph coloring).
- **Kéo–thả & đổi kích thước**: `@dnd-kit/core` cho kéo di chuyển; xử lý con trỏ thủ công (pointer events) cho kéo mép đổi kích thước và kéo tạo mới; bắt dính 15 phút bằng cách làm tròn pixel→phút.
- **Mini-tháng ở thanh bên**: component `Calendar` của shadcn (bọc `react-day-picker`).
- **Khung Tháng/Năm/Lịch biểu**: tự dựng bằng grid + `date-fns` (đã phổ biến, tree-shakeable) cho mọi phép tính ngày; `date-fns` chỉ dùng ở tầng hiển thị, dữ liệu vẫn là `Timestamp`.
- **Popover chi tiết / form**: `Popover`, `Dialog`, `Command` (chọn người đảm nhận), `Select`, `Sheet` (form đầy đủ trên mobile) — đều của shadcn.
- **Tầng dữ liệu**: Firestore Web SDK v9 (modular) + TanStack Query bọc các truy vấn không-realtime (tìm kiếm, danh bạ); các truy vấn khung nhìn dùng `onSnapshot` trực tiếp qua một hook `useCalendarItems(range, visibleCalendars)`.
- **Phím tắt**: một hook `useHotkeys` toàn cục (`d/w/m/y/a`, `t`, `j/k` hoặc `←/→`, `/` focus ô tìm kiếm).
- **Hoàn tác**: `sonner` toast với nút hành động; giữ thao tác nghịch đảo trong bộ nhớ client ~10 giây.

### 4. Sự kiện lặp lại

- Bản gốc lưu `recurrence` là chuỗi RRULE. Sửa với phạm vi:
  - **Chỉ mục này** → ghi `exceptions/{originalDateKey}` với `action: "modified"` + `overrides`.
  - **Mục này và các mục sau** → đặt `UNTIL` của bản gốc = ngay trước lần hiện đang sửa; tạo **bản gốc mới** với phần còn lại của quy tắc + các trường mới, `recurrenceId` trỏ về gốc ban đầu; sao chép các `exceptions` có ngày ≥ mốc sang bản gốc mới.
  - **Tất cả các mục** → sửa thẳng bản gốc; hỏi người dùng có ghi đè các `exceptions` không (mặc định giữ).
- Xoá tương tự: "chỉ mục này" = `exceptions` với `action: "cancelled"`; "mục này và sau đó" = đặt `UNTIL`.
- Giãn ở client: `RRule.between(windowStart, windowEnd)` rồi trừ/ghi đè theo `exceptions`.

### 5. Nhắc nhở

**Cơ chế chốt: hàng đợi `dueReminders` + scheduled function mỗi 1 phút.**

- Khi tạo/sửa **mục không lặp**: một Firestore trigger (`onWrite` `calendarItems`) tính lại các bản ghi `dueReminders` cho mục đó — xoá bản `pending` cũ, tạo bản mới với `sendAt = startAt - offset`, `recipientUids = assigneeIds ∪ {createdBy}`. Bỏ qua `sendAt` đã ở quá khứ khi tạo mới (không gửi nhắc trễ do vừa sửa).
- **Mục lặp**: một scheduled function chạy mỗi **15 phút** quét các bản gốc có `recurrence != null` và `reminders != []`, giãn các lần hiện trong **36 giờ tới**, và `upsert` `dueReminders` theo khoá `${itemId}_${occurrenceKey}_${offset}` (idempotent, không trùng).
- **Function gửi** chạy mỗi **1 phút**: `dueReminders where status == "pending" where sendAt <= now`, với mỗi bản ghi: tạo `notifications/{uid}/items` cho từng người nhận; nếu `channel == "push"` thì gửi FCM tới `fcmTokens/{uid}`; đặt `status = "sent"`. Bỏ nhắc (snooze) = tạo bản `dueReminders` mới `sendAt = now + snooze`.
- **Bám theo khi đổi giờ**: nằm sẵn trong trigger `onWrite` ở trên — mọi `pending` được tính lại từ `startAt` mới.

**Thay thế đã cân nhắc:** Cloud Tasks tạo task hẹn giờ cho từng nhắc. Chính xác hơn (giây thay vì phút) nhưng thêm phụ thuộc, phải quản lý tên task để huỷ/tạo lại khi đổi giờ, và độ trễ 1 phút là chấp nhận được cho lịch công việc. Giữ Cloud Tasks là phương án nếu sau này cần nhắc đúng giây.

### 6. Phân quyền — Firestore Security Rules

Hàm hỗ trợ trong `firestore.rules`:

```text
function member()      { return get(/databases/$(db)/documents/members/$(request.auth.uid)).data; }
function isMember()     { return request.auth != null && member().active == true; }
function isManager()    { return isMember() && member().role == "manager"; }
function calendarOf(id) { return get(/databases/$(db)/documents/calendars/$(id)).data; }
function canWriteCalendar(id) {
  return isManager() || calendarOf(id).writeScope == "everyone";
}
function isAssigneeOrCreator(item) {
  return request.auth.uid == item.createdBy || request.auth.uid in item.assigneeIds;
}
```

- `calendars`, `members`, `config`: đọc cho `isMember()`; ghi chỉ `isManager()` (members do Cloud Function ghi bằng Admin SDK — bỏ qua rules).
- `calendarItems` đọc: mọi `isMember()` (ẩn/hiện lịch con là lựa chọn client, **không** là ranh giới bảo mật).
- `calendarItems` tạo: `isMember() && canWriteCalendar(request.resource.data.calendarId) && request.resource.data.createdBy == request.auth.uid`.
- `calendarItems` sửa/xoá: `isManager() || (isAssigneeOrCreator(resource.data) && canWriteCalendar(request.resource.data.calendarId))`. Xoá thật bị cấm cho `staff` — chỉ cho đặt `deletedAt` (xoá mềm); Cloud Function dọn.
- `userCalendarPrefs/{uid}`, `fcmTokens/{uid}/...`, `notifications/{uid}/...`: chỉ chính chủ `uid`.
- `dueReminders`: client **không** đọc/ghi — chỉ Cloud Functions (Admin SDK).

### 7. Đồng bộ `members` từ hệ thống người dùng gốc

Một Cloud Function `onWrite` trên collection người dùng gốc của hệ thống marketing chiếu các trường cần thiết (`displayName`, `photoURL`, `system_role → role`, `active`) sang `members/{uid}`. Lần đầu triển khai chạy một script backfill. Nếu collection gốc không cố định schema, đội xác nhận đường dẫn khi apply (xem Open Questions).

## Risks / Trade-offs

- **[Risk] `array-contains-any` giới hạn 30 giá trị** → khung Tháng (42 ngày) phải tách 2 truy vấn; khung dài hơn cần nhiều lô hơn. **Mitigation:** giới hạn khung nhìn tối đa ~6 tuần cho lối đi `dayKeys`; khung Năm dùng `dayCounts`.
- **[Risk] Ngưỡng 45 ngày cho `dayKeys` là tuỳ chọn** — mục 40 ngày vẫn ghi mảng 40 phần tử mỗi lần sửa. **Mitigation:** ngưỡng cấu hình được; theo dõi kích thước document; nếu cần hạ xuống 31 (một tháng) và mở rộng lối đi long-span.
- **[Risk] Giãn chuỗi lặp ở client** — RRULE lạ (vd `BYSETPOS`) hoặc DST ở nơi khác có thể lệch. **Mitigation:** một múi giờ không DST; hạn chế UI chỉ phát sinh các RRULE mà `rrule` xử lý chắc; test vàng cho từng kiểu lặp.
- **[Risk] Scheduled function 15 phút cho nhắc mục lặp có thể bỏ sót** nếu một lần hiện được tạo và bắt đầu trong cùng cửa sổ < 15 phút. **Mitigation:** cửa sổ giãn 36 giờ ≫ chu kỳ 15 phút; trigger `onWrite` cũng chạy khi bản gốc đổi.
- **[Risk] `get()` trong Security Rules tính phí đọc và có giới hạn** (10 `get` lookup/request). **Mitigation:** rule chỉ `get` `members/{uid}` và `calendars/{id}` — tối đa 2; cân nhắc custom claims cho `role` nếu chi phí đọc lớn.
- **[Risk] Xoá mềm làm mọi truy vấn phải kèm `deletedAt == null`** và mọi composite index phải thêm trường đó. **Mitigation:** bọc mọi truy vấn trong hook `useCalendarItems`; lint nhắc; tài liệu hoá.
- **[Trade-off] Lọc loại/người đảm nhận ở client** → tải về nhiều hơn mức hiển thị sau lọc. Chấp nhận: tập đã thu hẹp theo thời gian, quy mô một phòng.
- **[Trade-off] `members` là bản sao** → trễ vài giây khi đổi vai trò/tên. Chấp nhận cho việc quản trị hiếm xảy ra.

## Migration Plan

Tính năng mới, không có dữ liệu lịch cũ.

1. Triển khai `firestore.rules` và `firestore.indexes.json` (chờ index build xong).
2. Deploy Cloud Functions: đồng bộ `members`, trigger `calendarItems` → `dueReminders`, scheduled 15' (nhắc lặp), scheduled 1' (gửi), scheduled hằng ngày (dọn xoá mềm), cập nhật `dayCounts`.
3. Chạy script backfill `members` từ danh bạ phòng marketing.
4. Seed `config/calendarSettings`; tạo 4 lịch dùng chung mặc định; tạo lịch cá nhân cho từng `member` `active`.
5. Bật FCM, thêm luồng xin quyền thông báo trong app.
6. Mở cho Trưởng phòng dùng thử một tuần trước khi mời toàn phòng.

**Rollback:** ẩn lối vào lịch trên navigation; Cloud Functions và collection giữ nguyên (không ảnh hưởng phần còn lại của hệ thống). Không có thay đổi phá vỡ với dữ liệu hiện có vì change này chỉ thêm collection mới và một Cloud Function chỉ-đọc trên collection người dùng.

## Open Questions

- Đường dẫn và schema chính xác của collection người dùng gốc trong hệ thống marketing hiện tại (để viết function đồng bộ `members`) — xác nhận khi apply.
- Có cần bật kênh **push (FCM)** ngay ở v1 hay chỉ chuông in-app trước, thêm push sau? (Không đổi spec — `channel: "push"` đã có sẵn, chỉ là bật/tắt bước cấu hình FCM.)
- Ngưỡng `spanDays` để chuyển sang `isLongSpan`: giữ 45 hay đặt 31? Chốt sau khi đo kích thước document thực tế.
- Khung Năm: dùng truy vấn trực tiếp `startDay`/`endDay` hay bảng `dayCounts` — quyết định sau khi đo hiệu năng với dữ liệu thật.

---

# MỤC D — TASKS (checklist triển khai)

## 1. Nền tảng dữ liệu Firestore & bảo mật

- [x] 1.1 Khai báo kiểu TypeScript cho `Calendar`, `CalendarItem`, `Reminder`, `RecurrenceException`, `DueReminder`, `Member` khớp mô hình ở `design.md` §1; verify `tsc --noEmit` pass. — ✅ `src/lib/domain/calendar/*` (10 file) + `calendar.domain.test.ts` (15 test). `tsc --noEmit` xanh. Thêm field dẫn xuất `isRecurring: boolean` (Firestore cấm `!=` + range trên 2 field).
- [ ] 1.2 Viết `firestore.indexes.json` với các composite index ở `design.md` §1 (mỗi index kèm `deletedAt`); verify `firebase deploy --only firestore:indexes` chạy xong và index ở trạng thái Enabled trong console. — 🟡 6 index viết xong; JSON hợp lệ, emulator nạp OK. `npm run indexes:deploy` (deploy production `hem-manager`) chờ xác nhận — chưa chạy.
- [x] 1.3 Viết `firestore.rules` với các hàm hỗ trợ và luật cho `calendars`, `calendarItems`, `userCalendarPrefs`, `fcmTokens`, `notifications`, `dueReminders` theo `design.md` §6; verify bộ test `@firebase/rules-unit-testing` phủ: staff không xoá cứng được, staff sửa được mục mình đảm nhận, staff không sửa mục người khác, non-member bị chặn đọc. — ✅ block rules + `src/test/rules/calendar.rules.test.ts` **32 test pass** (`npm run test:emulator`). `notifications` KHÔNG thêm rule mới — tái dùng block phẳng có sẵn.
- [x] 1.4 Seed document `config/calendarSettings` (`timezone`, `weekStartsOn: 1`, `defaultView`); verify đọc được từ client qua emulator. — ✅ `scripts/seed-calendar-settings.mjs` + `npm run seed:calendar-settings`; chạy qua `emulators:exec` ghi + đọc lại đúng. Ca "member đọc được config" cũng trong rules test.
- [x] 1.5 Dựng Firebase emulator suite (Firestore + ~~Functions~~ + Auth) cho phát triển và test; verify `firebase emulators:start` chạy và app kết nối được. — ✅ `firebase.json` block `emulators` (auth 9099, firestore 8080, ui 4000; **bỏ Functions** — Q2). `src/firebase/config.ts` nối emulator khi `NEXT_PUBLIC_FIREBASE_USE_EMULATOR=true`. Verify: client SDK sign-in anonymous + Firestore round-trip qua emulator OK.

## 2. Đồng bộ thành viên & seed lịch mặc định

- [x] 2.1 ~~Cloud Function `onWrite`~~ chiếu collection người dùng gốc `users` → `members/{uid}` (`displayName`, `photoURL`, `role` từ `system_role`, `active`); verify sửa một user gốc trong emulator cập nhật đúng `members/{uid}`. — ✅ Q2: KHÔNG Cloud Function. `src/lib/server/calendar/membersSync.ts` (`resolveMemberFields` + `syncSelfMember` + `reconcileAllMembers`) chạy qua: `POST /api/members/self` (lúc đăng nhập, gọi từ `AuthContext`) + `POST /api/jobs/members-reconcile` (cron hằng đêm `31 2 * * *` trong `scheduled-jobs.yml`). Test emulator `src/test/integration/membersSync.test.ts` — 8 ca pass (tạo, drift role/tên, fallback token, deactivate khi user bị xoá).
- [x] 2.2 Script backfill `members` từ danh bạ phòng marketing hiện có; verify sau khi chạy, số document `members` bằng số thành viên active. — ✅ `scripts/backfill-members.mjs` + `npm run backfill:members` (= chạy tay một lần logic của `reconcileAllMembers`). Test: `reconcileAllMembers` với 3 user → 3 member active, count khớp.
- [x] 2.3 Script seed 4 lịch dùng chung mặc định ("Mục tiêu phòng" = `managerOnly`, "Chiến dịch", "Nội dung", "Ads" = `everyone`) với màu và `defaultReminders`; verify 4 document `calendars` tồn tại đúng `writeScope`. — ✅ `scripts/seed-calendars.mjs` + `npm run seed:calendars`; logic ở `src/lib/server/calendar/calendarSeed.ts` (`seedDefaultSharedCalendars`). Doc id cố định `default_{goals,campaigns,content,ads}`, non-destructive. Test emulator `calendarSeed.test.ts` — 4 lịch đúng `writeScope`, re-run không đè.
- [x] 2.4 Khi tạo `members/{uid}` mới thì tạo kèm lịch cá nhân `kind: "personal"`, `ownerUid`, `writeScope: "everyone"`; verify thêm member mới sinh đúng một lịch cá nhân. — ✅ `ensurePersonalCalendar` trong `membersSync.ts`, gọi từ `writeMember`. Test: lần sync đầu tạo đúng 1 lịch cá nhân, lần 2 tạo 0.

## 3. Tầng dữ liệu client

- [x] 3.1 Provider `CalendarSettingsProvider` đọc `config/calendarSettings` + `MembersProvider` đọc `members` (một `onSnapshot`); verify component con lấy được timezone và danh bạ. — ✅ `src/modules/team-calendar/context/CalendarDataProvider.tsx` (2 context + `CalendarDataProvider` root, hook `useCalendarSettings` / `useMembers`, guard trên `useAuth().user`). Data đọc được đã cover ở rules test (member đọc `config` + `members`). Repo không có infra test React component — theo pattern có sẵn (logic ở hàm thuần).
- [x] 3.2 Hook `useVisibleCalendars()` hợp nhất `calendars` với `userCalendarPrefs/{uid}` (ẩn + màu ghi đè); verify trả về danh sách kèm cờ `hidden` và màu hiệu lực. — ✅ Hook + `resolveVisibleCalendars` / `visibleCalendarIdSet` (thuần, `visibleCalendars.test.ts` 7 ca: hidden, màu ghi đè, màu rác bị bỏ, prefs null, archived, thứ tự personal-trước).
- [x] 3.3 Hook `useCalendarItems(range, visibleCalendarIds)` thực hiện chiến lược truy vấn `design.md` §2 (lô `array-contains-any` mục ngắn + truy vấn long-span + bản gốc lặp), mọi truy vấn kèm `deletedAt == null`, gắn `onSnapshot`, huỷ listener khi đổi tham số; verify test: mục trải 2 tháng xuất hiện ở cả 2 tháng; đổi range huỷ listener cũ. — ✅ `planViewQueries` + `partitionViewItems` (thuần, `viewQuery.test.ts`) + `openCalendarItemsListener` (3+ stream, dedupe, `stop()` gỡ hết) + hook. Test emulator `calendarView.test.ts` 6 ca: mục Aug 25–Sep 5 hiện ở cả window Aug và Sep, long-span, recurring master tách ra, lịch ẩn bị lọc, `stop()` không emit tiếp, window mới chỉ thấy phạm vi của nó.
- [x] 3.4 Tiện ích `computeDayFields(item)` tính `startDay`, `endDay`, `spanDays`, `dayKeys`, `isLongSpan` từ `startAt/endAt/allDay` theo giờ VN; verify unit test cho mục trong ngày, mục cả ngày 1 ngày, mục 10 ngày, mục 90 ngày. — ✅ `src/lib/domain/calendar/dayFields.ts` + `dayFields.test.ts` (16 ca gồm đủ 4 ca task + qua nửa đêm, đúng nửa đêm, ngưỡng 45/46, qua ranh giới tháng). Tái dùng `ICT_OFFSET_MS` của `reportPeriod.ts`.
- [x] 3.5 Lớp ghi `calendarItemsRepo` (create/update/softDelete/restore/duplicate) luôn set lại các trường day và `updatedAt`; verify test tạo mục rồi đọc lại thấy `dayKeys` đúng. — ✅ `src/lib/server/calendar/calendarItemsRepo.ts` (server-side, route handler nhóm 5 bọc auth/validation/dueReminders). `deriveStoredItemFields` luôn tính lại day + `isRecurring`; chuẩn hoá instant all-day về nửa đêm VN. Test emulator `calendarItemsRepo.test.ts` 11 ca.

## 4. Quản lý lịch con (capability `team-calendar`)

- [x] 4.1 Thanh bên "Lịch của tôi" liệt kê lịch con với ô ẩn/hiện và chấm màu; verify bỏ chọn một lịch thì mục của nó biến mất khỏi khung nhìn hiện tại, người khác không đổi. — ✅ `CalendarSidebar.tsx` (personal + shared, checkbox tô màu `effectiveHex`). "Ẩn → mục biến mất" đã cover ở `calendarView.test.ts` (nhóm 3, lịch không trong `visibleCalendarIds` bị lọc); "theo người" do `userCalendarPrefs/{uid}` (rules `isOwner`). UI không có infra test.
- [x] 4.2 Ghi `userCalendarPrefs/{uid}.hidden` và `colorOverrides` khi người dùng đổi; verify đăng xuất/đăng nhập lại giữ đúng trạng thái ẩn và màu ghi đè. — ✅ `userCalendarPrefs.client.ts` (`setCalendarHidden`/`setCalendarColorOverride`/`setLastView`/`setShowWeekNumbers`, client ghi trực tiếp — rules `isOwner`). Bền vững vì lưu Firestore theo uid. Rules test (nhóm 1) đã phủ owner ghi được / người khác bị chặn.
- [x] 4.3 Dialog tạo/sửa lịch con (tên bắt buộc, màu bắt buộc, mô tả, `writeScope`, `defaultReminders`) chỉ hiện với `manager`; verify staff không thấy nút tạo và ghi trực tiếp bị rules chặn. — ✅ `CalendarFormDialog.tsx` (chỉ render khi `usePermissions().isManager`) + `src/components/ui/dialog.tsx` mới (bọc `@base-ui/react/dialog`) + `RemindersField` / `CalendarColorSelect` dùng chung. Server: `POST /api/calendars` + `calendarsRepo.createCalendar` (`requireSystemManager`). Rules: `calendars create/update/delete: if isCalendarManager()` — rules test "staff cannot create/rename a sub-calendar" pass.
- [x] 4.4 Luồng xoá lịch con còn chứa mục: hỏi "chuyển mục sang lịch khác" hoặc "xoá luôn mục"; verify cả hai nhánh cho kết quả đúng và có bước xác nhận. — ✅ `DeleteCalendarDialog.tsx` (radio 2 nhánh + chọn lịch đích + nút "Xoá lịch" destructive) + `DELETE /api/calendars/[id]` + `calendarsRepo.deleteCalendar(mode, targetCalendarId)`. Test emulator `calendarsRepo.test.ts`: reassign chuyển hết mục rồi xoá lịch; deleteItems hard-delete rồi xoá lịch; validate lịch đích; chặn xoá lịch cá nhân.
- [x] 4.5 Lưu trữ (archive) lịch con: ẩn khỏi danh sách mặc định, mục thành chỉ đọc; verify lịch archived không xuất hiện trừ khi bật bộ lọc "đã lưu trữ". — ✅ `PATCH /api/calendars/[id] { archived }` + `resolveVisibleCalendars` lọc archived trừ khi `includeArchived` (nhóm 3, `visibleCalendars.test.ts`) + toggle "Hiện lịch đã lưu trữ" ở sidebar. **"Mục chỉ đọc"**: `firestore.rules` `canWriteCalendar` thêm `archived != true` (chặn cả Trưởng phòng), `itemEditableById` restructure; `assertCalendarAcceptsItems` cho route nhóm 5. Rules test "archived calendar → items read-only" 4 ca pass.

## 5. Mục lịch: chi tiết, soạn thảo, realtime (capability `team-calendar`)

- [x] 5.1 Popover chi tiết khi bấm mục: tiêu đề (fallback "(Không có tiêu đề)"), chỉ dấu loại, thời gian, lịch con, người đảm nhận, địa điểm, mô tả, liên kết Dự án/hạng mục; nút Sửa/Xoá/Nhân bản theo quyền; verify hiển thị đúng cho 3 loại và mục không tiêu đề. — ✅ `ItemPopover.tsx` (`src/components/ui/popover.tsx` mới bọc `@base-ui/react/popover`) + `TypeBadge` + `AssigneeChips`. Nút theo `canEditCalendarItem` (thuần, dùng chung client+server). `calendarItemDisplayTitle` / `formatItemTimeRange` unit-tested. Ma trận nút = `calendarItemsService.test.ts` (staff sửa mục mình tạo/đảm nhận, không sửa mục người khác). Server: `POST/PATCH/DELETE /api/calendar-items` + `/duplicate` + `/restore`.
- [x] 5.2 Form soạn thảo đầy đủ (`Dialog` desktop / `Sheet` mobile): mọi trường của `CalendarItem`, chọn loại, cờ cả ngày, chọn ngày–giờ, chọn lịch con, ô liên kết Dự án/hạng mục; verify tạo mục theo giờ và mục cả ngày nhiều ngày lưu đúng. — ✅ `ItemEditorForm.tsx` (`useIsMobile` → Dialog/Sheet, mọi trường + `RemindersField`, chọn Dự án từ `useMyProjects`). Server `calendarItemsService.createItem/updateItem`. Test emulator: tạo mục theo giờ (day fields đúng), tạo mục cả ngày 30 ngày (`spanDays: 30`), kế thừa `defaultReminders`.
- [x] 5.3 Kiểm tra hợp lệ: chặn `endAt <= startAt` (mục theo giờ), cho `endDay >= startDay` (cả ngày); verify thông báo lỗi rõ ràng, không lưu. — ✅ `assertRange` ở service (`HttpError 400` "Giờ kết thúc phải sau giờ bắt đầu" / "Ngày kết thúc không được trước ngày bắt đầu") + kiểm tra client trong form (toast). Test: `endAt == startAt` timed bị từ chối; all-day 1 ngày (`endDay == startDay`) cho phép (`spanDays: 1`).
- [x] 5.4 Liên kết Dự án/hạng mục mở tab mới, không rời lịch; verify bấm liên kết trong popover mở đúng URL Dự án. — ✅ `ItemPopover` render `<a href={/campaigns/${linkedProjectId}} target="_blank" rel="noreferrer">`. `linkedContentItemId` giữ trong model, picker chi tiết để sau.
- [x] 5.5 Realtime: tạo/sửa/xoá phản ánh sang phiên khác trong vài giây; đóng popover khi mục đang mở bị xoá kèm thông báo ngắn; verify với 2 phiên trình duyệt. — ✅ Realtime = `onSnapshot` (`useCalendarItems`, nhóm 3, đã test 2 phiên ở `calendarView.test.ts`). `ItemPopover` gắn `onSnapshot(doc(calendarItems/{id}))` khi mở → mất/`deletedAt != null` thì đóng + toast "Mục lịch đã bị xoá".
- [x] 5.6 Chỉ dấu loại (biểu tượng/nhãn) trên mọi khung nhìn; verify phân biệt được `Mục tiêu`/`Hoạt động`/`Nhiệm vụ` không cần mở chi tiết. — ✅ `TypeBadge.tsx` (icon lucide `Target`/`Activity`/`ListTodo` + `title` + nhãn tuỳ chọn) — component dùng chung cho mọi khung nhìn nhóm 6.

## 6. Khung nhìn (capability `calendar-views`)

- [x] 6.1 Bố cục trang lịch: thanh công cụ … thanh bên … vùng khung nhìn chính; responsive, thanh bên thu vào `Sheet` mobile. — ✅ `CalendarPage.tsx` + `CalendarToolbar.tsx` + `src/app/(dashboard)/calendar/page.tsx` + nav "Lịch đội". `useIsMobile` → thanh bên vào `Sheet`. `next build` xanh (route `/calendar`).
- [x] 6.2 Khung Tuần & Ngày: lưới giờ 24h cuộn, hàng "cả ngày" cố định, cuộn sẵn ~07:00. — ✅ `views/DayWeekGrid.tsx` (HOUR_PX grid, `scrollTop = WORKDAY_SCROLL_MINUTE`, `allDay || spanDays>1` → hàng trên). `timedLayout.ts` (`itemDayBounds` clip đa ngày) unit-tested.
- [x] 6.3 Thuật toán phân làn. — ✅ `lanes.ts::packLanes` (interval graph coloring) — `lanes.test.ts` **6 ca** gồm "3 mục trùng 09:00–10:00 → 3 cột", tách cluster, lane tái dùng khi hết chồng.
- [x] 6.4 Vạch giờ hiện tại tự cập nhật mỗi phút. — ✅ `timedLayout.ts::nowLinePercent` (null nếu không phải hôm nay) unit-tested + `useCurrentMinute` (tick canh đầu phút).
- [x] 6.5 Khung Tháng: 6 hàng thứ Hai, ngoài tháng mờ, "còn N mục" mở popover, bấm ô trống → Ngày. — ✅ `views/MonthGrid.tsx` (MAX_PER_CELL=3, Popover "còn N mục"). `viewNavigation.ts::monthGridDays` (42 ngày, bắt đầu thứ Hai) unit-tested.
- [x] 6.6 Khung Năm: 12 tháng thu nhỏ, ngày có mục đánh dấu, bấm ngày → Ngày, không tải chi tiết. — ✅ `views/YearGrid.tsx` (chỉ chấm màu, không `ItemChip`). **Lệch Q5**: dùng `useCalendarItems` cửa sổ năm (13 lô `array-contains-any`) thay vì `dayCounts` hay query gọn riêng — chấp nhận v1, tối ưu sau nếu đo thấy chậm.
- [x] 6.7 Khung Lịch biểu: gộp theo ngày, bỏ ngày trống, tải thêm. — ✅ `views/AgendaList.tsx` + nút "Tải thêm" → `CalendarPage` tăng `agendaPages` → nới `windowEndDay` +30 ngày.
- [x] 6.8 Điều hướng. — ✅ `viewNavigation.ts::stepAnchor` / `rangeLabel` unit-tested; `MiniMonth.tsx` giữ loại khung nhìn.
- [x] 6.9 "Hiển thị số tuần" cho Tuần/Tháng. — ✅ `isoWeekNumber` (ISO-8601) unit-tested + toggle ở toolbar → lưu `userCalendarPrefs.showWeekNumbers`.
- [x] 6.10 Hook phím tắt `d/w/m/y/a`, `t`, `←/→`, `/`. — ✅ `useHotkeys.ts` — bỏ qua khi target là INPUT/TEXTAREA/SELECT/contentEditable hoặc có modifier.
- [x] 6.11 Nhớ khung nhìn gần nhất. — ✅ `useCalendarView.ts` — localStorage (`tac:lastView`) + mirror `userCalendarPrefs.lastView`.

## 7. Thao tác trực tiếp (capability `calendar-item-editing`)

- [x] 7.1 Bấm ô trống tạo nhanh: popover chỉ tiêu đề + chọn lịch/người đảm nhận + "Sửa thêm"; Ngày/Tuần mục 60', Tháng mục cả ngày; Enter lưu loại `Nhiệm vụ`, Esc huỷ. — ✅ `QuickCreatePopover.tsx` (base-ui popover neo vào rect ô bấm) + `dragMath.ts::quickCreateBounds` unit-tested (Ngày/Tuần → 60' timed, Tháng → all-day). "Sửa thêm" → `ItemEditorForm` với seed. `DEFAULT_CALENDAR_ITEM_TYPE = "task"`.
- [x] 7.2 Kéo dọc trên lưới giờ tạo mục theo khoảng, bắt dính 15'. — ✅ `DayWeekGrid` pointer-drag trên cột ngày → vùng chọn ghost → `QuickCreatePopover`. `dragMath.ts::snapMinutes` unit-tested ("10:07 → 10:00", "10:08 → 10:15").
- [x] 7.3 Kéo thân mục di chuyển qua `@dnd-kit`, giữ thời lượng. — ✅ `CalendarDndContext` (PointerSensor, activation 6px) + `DraggableEvent` (`useDraggable`). DayWeek: `delta.y`→phút, `delta.x`→cột ngày; Tháng: `delta` → số ngày. `applyDragMove` (giữ duration, snap) unit-tested. Realtime = `updateCalendarItem` → `onSnapshot`.
- [x] 7.4 Chặn kéo khi không đủ quyền. — ✅ `DraggableEvent` `disabled` khi `!canEditCalendarItem` (client) + server `assertCanEditItem` (403). Trên 403, `onSnapshot` snap mục về chỗ cũ. Ma trận đã test ở `calendarItemsService.test.ts`.
- [x] 7.5 Kéo mép đổi thời lượng, bắt dính 15', tối thiểu 15', không âm. — ✅ `DraggableEvent` `ResizeHandle` (pointer thủ công, `stopPropagation` để không kích hoạt dnd). `dragMath.ts::applyResize` unit-tested (min 15', không đảo ngược).
- [x] 7.6 Toast Hoàn tác `sonner` sau move/resize/tạo nhanh/xoá, ~10s, thao tác nghịch đảo. — ✅ `useCalendarUndo` (duration 10_000, action "Hoàn tác"). Move/resize → `updateCalendarItem(before)`; tạo nhanh → `deleteCalendarItem`; xoá → `restoreCalendarItem`. Route `restore` khôi phục nguyên vẹn (test ở nhóm 5).
- [x] 7.7 Nhân bản: sao mọi trường trừ `recurrence`. — ✅ `POST /api/calendar-items/[id]/duplicate` + `duplicateCalendarItem` (test emulator: recurrence null, `isRecurring` false, `createdBy` = người bấm, assignee giữ). ⚠️ **Lệch**: chưa tự mở form bản sao — toast xác nhận, bản sao hiện qua realtime để bấm sửa.
- [x] 7.8 Kéo/resize một lần hiện chuỗi lặp → hỏi phạm vi trước khi lưu. — ✅ `RecurrenceScopeDialog.tsx` (3 lựa chọn) dựng xong; **nối hành vi ở nhóm 8** (hiện chưa render occurrence nên chưa có điểm gọi).

## 8. Sự kiện lặp lại (capability `recurring-items`)

- [x] 8.1 Tích hợp `rrule`; `expandRecurrence(master, exceptions, windowStart, windowEnd)`. — ✅ `src/lib/domain/calendar/recurrence.ts` (dùng `rrule@2.8.1`, xử lý múi giờ bằng dịch +7h — VN không DST). `recurrence.test.ts` **16 ca**: hàng ngày, hàng tuần MO+WE COUNT=10, hàng tháng theo ngày, hàng tháng "thứ Sáu đầu tiên" (BYSETPOS), hàng năm, "mỗi 3 ngày", UNTIL, exception cancelled/modified, cửa sổ 2 năm sau.
- [x] 8.2 UI đặt quy tắc lặp trong form. — ✅ `RecurrenceEditor.tsx` (preset Ngày/Tuần/Tháng/Năm + `Mỗi N` + chọn thứ + Tháng "theo ngày/thứ N" + kết thúc không bao giờ/sau N lần/vào ngày) trong `ItemEditorForm`. `partsToRRuleString`/`rruleStringToParts`/`describeRecurrence`/`previewOccurrences` unit-tested (round-trip).
- [x] 8.3 Chuyển mục đơn ↔ mục lặp. — ✅ `updateItem({ recurrence })` — `deriveStoredItemFields` set `isRecurring`, `startAt` (= lần hiện đầu) không đổi. Test emulator `recurrenceOps.test.ts`.
- [x] 8.4 Hộp thoại phạm vi khi **sửa**. — ✅ `RecurrenceScopeDialog` trong `ItemEditorForm` (khi `item.occurrence`). Server `recurrenceOps.editSeries`: "this" → `exceptions/{key}` modified; "thisAndFollowing" → `setRRuleUntil` master + tạo master mới `recurrenceId` trỏ gốc + chép exceptions ≥ mốc; "all" → sửa master. Test emulator 3 nhánh.
- [x] 8.5 Hộp thoại phạm vi khi **xoá**. — ✅ `ItemPopover` `handleDelete` → `RecurrenceScopeDialog` (action delete). `recurrenceOps.deleteSeries`: "this" → `exceptions/{key}` cancelled; "thisAndFollowing" → `UNTIL` (hoặc soft-delete master nếu xoá từ đầu). Test emulator.
- [x] 8.6 Bảo toàn ngoại lệ khi sửa toàn chuỗi. — ✅ `editSeries(scope="all")` mặc định giữ exceptions; `overwriteExceptions=true` xoá exceptions `modified`. Test: lần đã dời giờ vẫn giữ sau khi sửa "all" mặc định; bị xoá khi `overwrite`.
- [x] 8.7 Giãn theo cửa sổ, không vật chất hoá. — ✅ `expandRecurrence` chỉ trả occurrence trong cửa sổ, id tổng hợp `master::YYYY-MM-DD` (không phải Firestore doc). Test: chuỗi hàng ngày vô hạn → tháng năm 2028 đủ 30 occurrence, `id.includes("::")`. Client: `useExpandedRecurring` gộp vào view.

## 9. Người đảm nhận (capability `item-assignees`)

- [x] 9.1 Ô chọn người đảm nhận (`Command` + multi-select) lấy từ `members` active, đánh dấu một người phụ trách chính, mặc định người đầu tiên; verify không thêm được tên ngoài danh bạ. — ✅ `MemberMultiSelect.tsx` (Popover + ô lọc trên `members` active; repo không có `cmdk`/`Command` nên dựng bằng Popover, **không có nhập tự do** → không thêm được tên ngoài danh bạ) + `AssigneePicker.tsx` (sao ⭐ đặt phụ trách chính, mặc định người đầu qua `resolvePrimaryAssignee`). Thay ô checkbox cũ trong `ItemEditorForm`. Chặn server: `assertAssigneesInDirectory` từ chối uid không có doc `members/{uid}` (lúc tạo + id **mới thêm** khi sửa; assignee đã rời đội vẫn giữ được). Test emulator `calendarItemsService.test.ts` (ngoài danh bạ → `/danh bạ/`).
- [x] 9.2 Lưu `assigneeIds` + `primaryAssigneeId`; verify đổi phụ trách chính và gỡ hết người đảm nhận lưu đúng. — ✅ Qua payload form → `deriveStoredItemFields` gọi `resolvePrimaryAssignee`. Test emulator (6 ca): 3 người → người đầu là chính; đổi chính sang người thứ 2; gỡ hết → `primaryAssigneeId` null; bỏ người đang là chính khỏi list → chọn lại người còn lại đầu tiên; primary yêu cầu ngoài list → người đầu.
- [x] 9.3 Hiển thị trên mục: avatar người phụ trách chính + "+N"; popover liệt kê đầy đủ, phụ trách chính đứng đầu có nhãn; verify với mục 3 người. — ✅ `AssigneeChips.tsx` (gọn: avatar chính + "+N"; đầy đủ: danh sách, chính đầu, nhãn "(phụ trách chính)") dùng `orderAssigneesByPrimary` (thuần, unit-test). `ItemChip` giờ hiện chỉ dấu **cả ở chế độ compact** (khung Tuần/Tháng) — trước đó bị ẩn. `ItemPopover` hiện danh sách `expanded`.
- [x] 9.4 Bộ lọc "Người đảm nhận" (multi-select) áp cho mọi khung nhìn, bền vững khi đổi khung nhìn/điều hướng trong phiên; verify lọc 1 người và 2 người (OR). — ✅ `filters.ts::itemMatchesFilters` (OR, thuần, unit-test 1 & 2 người) + `useCalendarFilters` (sessionStorage `tac:filters`) + `AssigneeFilter.tsx` trong toolbar. `CalendarPage` lọc `filteredItems` truyền cho cả 4 view (Ngày/Tuần/Tháng/Năm/Lịch biểu). State ở hook nên bền qua đổi view + điều hướng thời gian.
- [x] 9.5 Lối tắt "Việc của tôi" đặt bộ lọc về người đang đăng nhập; verify bật chỉ còn mục mình đảm nhận, tắt trở lại bình thường. — ✅ Nút "Việc của tôi" trong `AssigneeFilter`; `toggleMine` (bật → `mine:true` + xoá list chọn tay; tắt → `mine:false`). `itemMatchesFilters` cộng `currentUid` vào tập cần khớp khi `mine`. Unit-test: mine khớp đúng uid; mine trơ khi chưa đăng nhập; mine OR với list tay.
- [x] 9.6 Quyền chỉnh sửa gắn với người đảm nhận: staff là người đảm nhận sửa/hoàn thành được mục do người khác tạo; verify ở client và rules unit test (nối §1.3). — ✅ Đã có từ nhóm 5/1: `canEditCalendarItem` (client, dùng ở `ItemPopover`/`DraggableEvent`), `assertCanEditItem` (server), `firestore.rules::isItemEditor`. Thêm unit-test `canEditCalendarItem` (manager mọi mục; creator; assignee chính/phụ; người ngoài → false). Rules test "staff can edit an item they are assigned to" + server test "staff edits an item they are assigned to" đã xanh.

**Requirement "Thông báo khi được giao hoặc gỡ khỏi mục"** (capability `item-assignees`, không có task nhóm 9): **đã làm ở nhóm 10** cùng hạ tầng gửi. Chốt store: **collection riêng của lịch `calendarNotifications/{uid}/items`** (phương án b) — KHÔNG dùng lại `notifications` của CPT (project/content-scoped, enum ở domain CPT không được chạm) và cũng chính là hình dạng `notifications/{uid}/items` Mục C §1 phác. Server-only writes; chính chủ đọc feed realtime, mark-read/snooze qua `/api/calendar-notifications/**`. `notifyAssigneeChange` trong `calendarItemsService` (create/update/duplicate) diff `assigneeIds`, gửi `assigned`/`unassigned`, **không bao giờ gửi cho người thực hiện** (kể cả tự thêm mình). Test emulator `calendarAssigneeNotifications.test.ts` phủ 3 Scenario.

## 10. Nhắc nhở (capability `calendar-reminders`)

- [x] 10.1 Kế thừa `defaultReminders` của lịch con khi tạo mục; đổi mặc định không ảnh hưởng mục cũ; verify tạo mục trong lịch có mặc định "30' trước" thì mục có sẵn mốc đó. — ✅ `createItem` dùng `input.reminders ?? calendarDefaultReminders(...)` (đã có từ nhóm 5) — chỉ kế thừa khi client KHÔNG gửi `reminders`; `[]` tường minh vẫn là "không nhắc". UI: `RemindersField` cho `defaultReminders` trong `CalendarFormDialog`. Test emulator: mục kế thừa `[30m]`; sửa `defaultReminders` lịch sang `[60m]` → mục cũ vẫn `[30m]` (copy, không link).
- [x] 10.2 UI thêm/sửa/xoá mốc nhắc theo mục (offset phút/giờ/ngày/tuần + kênh inapp/push), tối đa 5; verify vượt 5 bị chặn; xoá hết = không nhắc kể cả lịch có mặc định. — ✅ `RemindersField` trong `ItemEditorForm` (nút "Thêm" disabled ở 5, báo "Tối đa 5 mốc"); server `remindersSchema.max(5)` (unit-test 5 ok / 6 fail). Kênh push ẩn ở v1 (`allowPush=false`, answer #3). "Xoá hết" → `reminders: []` tường minh → `recomputeItemReminders` xoá mọi row pending (test emulator).
- [x] 10.3 `onWrite calendarItems` cho mục **không lặp**: tính lại `dueReminders` `pending`. — ✅ Không có Cloud Function (answer #2) → `recomputeItemReminders(db, itemId)` chạy **inline trong `calendarItemsService`** ở create/update/restore/duplicate (và `cancelItemReminders` ở delete). `sendAt = startAt - offset`, `recipientUids = assigneeIds ∪ createdBy` (`reminderRecipientUids`), bỏ qua `sendAt <= now`. Doc id `${itemId}_single_${offset}` (idempotent). Test emulator 7 ca: 1 row/offset, recipients có/không assignee, dời giờ dời `sendAt`, quá khứ bị bỏ, xoá hết, soft-delete → cancelled.
- [x] 10.4 Job 15' cho mục **lặp**: giãn lần hiện 36h tới, upsert `dueReminders` idempotent `${itemId}_${occurrenceKey}_${offset}`. — ✅ `POST /api/jobs/calendar-reminders-expand` (GitHub Actions cron `2,17,32,47 * * * *`) → `expandRecurringReminders`: query `deletedAt==null && isRecurring==true`, `expandRecurrence` (áp exceptions) trong `[now, now+36h]`, upsert; không hồi sinh row đã `sent`/`cancelled`. Test emulator: 2 occurrence/36h; chạy 2 lần → cùng bộ id.
- [x] 10.5 Job gửi: `dueReminders where status==pending and sendAt<=now` → tạo bản ghi in-app cho từng người nhận, set `status=sent`. — ✅ `POST /api/jobs/calendar-reminders-send` (cron `*/5 * * * *`; Mục C muốn 1', ~5' là sàn GitHub Actions — answer #2) → `sendDueReminders`: mỗi row → `calendarNotifications/{uid}/items` (kind `reminder`) cho từng `recipientUid`, `status=sent`. Push (`channel=="push"`) **bỏ qua ở v1** (answer #3) — row in-app vẫn luôn tạo, không throw. Test emulator 3 ca (in-app/recipient, push vẫn tạo in-app, chưa tới giờ thì không gửi).
- [x] 10.6 Snooze: "bỏ nhắc 5'/30'/1h" tạo `dueReminders` mới; nhắc chưa xử lý vẫn chưa đọc sau khi mục bắt đầu. — ✅ `POST /api/calendar-notifications/[id]/snooze` → `snoozeNotification` → `snoozeReminder` tạo row `sendAt = now + minutes`, `recipientUids = [người bấm]`, và mark-read bản ghi hiện tại. `SNOOZE_PRESETS_MINUTES = [5,30,60]`. Test emulator: re-queue đúng người + delay; bản ghi `sent` chưa mark vẫn `readAt == null`.
- [ ] 10.7 Đăng ký FCM token + luồng xin quyền. — ⏸️ **Hoãn sang sau v1** (answer #3: không dựng service worker / luồng xin quyền / `fcmTokens` ở v1). `firestore.rules` cho `fcmTokens/{uid}/tokens` đã có sẵn; kênh `push` trên `Reminder` giữ trong model, job gửi bỏ qua nhánh push.
- [x] 10.8 Chuông in-app: badge chưa đọc, danh sách, đánh dấu đã đọc, bấm mở đúng mục trên lịch. — ✅ `CalendarNotificationBell` (trong toolbar) — feed realtime `onSnapshot` trên `calendarNotifications/{uid}/items` (không poll), badge số chưa đọc, "Đánh dấu tất cả đã đọc", nút snooze trên row `reminder`. Bấm → `openItemFromNotification`: `occurrenceKey` (mục lặp) hoặc `startDay` (getDoc) → `setAnchor + view "day"`; mục đã xoá → toast. `firestore.rules`: chính chủ đọc, ghi qua server.

## 11. Đăng nhập & phân quyền (capability `calendar-access-control`)

- [x] 11.1 Cổng xác thực + deep-link sau đăng nhập. — ✅ `AuthGuard` (layout dashboard, dùng chung) đã chặn chưa-đăng-nhập → `/login`; bổ sung: lưu `pathname` vào `sessionStorage[auth:postLoginRedirect]` trước khi redirect, `LoginForm` đọc + xoá key đó sau khi auth thành công (email/password + Google), fallback `/campaigns`. Chỉ nhận path nội bộ (`startsWith("/")`, không `//`). **Chạm 2 file hạ tầng CPT** (`AuthGuard`, `LoginForm`) — thay đổi thuần cộng, tương thích ngược.
- [x] 11.2 Chặn tài khoản không thuộc `members` active + màn hình "không có quyền". — ✅ `CalendarAccessGate` bọc `CalendarPage` (trong `CalendarDataProvider` để có `useMembers`): `!byUid.has(user.uid)` → màn hình "Bạn không có quyền vào lịch đội". Non-member đọc `members` bị rules chặn → list rỗng → cùng nhánh. **Server**: `requireCalendarMember(db, uid)` (đọc `members/{uid}`, 403 nếu thiếu/inactive) gọi đầu mọi mutation `calendarItemsService` (create/update/delete/restore/duplicate) — chặn ghi trực tiếp qua API không qua UI. Test emulator: uid không có doc / member inactive / non-member update → 403.
- [x] 11.3 Vai trò từ `members/{uid}.role` qua `usePermissions()`. — ✅ `usePermissions` giờ đọc `useMembers().byUid.get(uid)?.role` (KHÔNG phải `users.system_role` nữa) — cùng giá trị nhưng buộc "có vai trò" ⟺ "là thành viên". Trả thêm `isMember`. Các nút manager (`CalendarSidebar` tạo/sửa/xoá lịch, `CalendarFormDialog`) đã gate theo `isManager` từ trước.
- [x] 11.4 Lịch `managerOnly`: staff không chọn/ghi được, vẫn xem chỉ đọc. — ✅ Đã có từ trước: `writableCalendars` lọc bỏ `managerOnly` cho staff trong `ItemEditorForm`/`QuickCreatePopover`; `assertCalendarAcceptsItems` (409/403) server; `firestore.rules::canWriteCalendar`. Bổ sung: icon 🔒 trên hàng lịch `managerOnly` trong `CalendarSidebar` cho staff (xem được, không ghi). "Mục tiêu phòng" mặc định `managerOnly` (seed `DEFAULT_SHARED_CALENDARS`).
- [x] 11.5 Bộ test rules end-to-end phủ ma trận; suite xanh. — ✅ `calendar.rules.test.ts` **44 ca**: đọc mọi lịch (member) / non-member + inactive + anon bị chặn; tạo theo `writeScope` (staff trong `everyone` ok, `managerOnly` fail, `createdBy != caller` fail); sửa/xoá theo creator/assignee/manager; **staff không xoá cứng** (chỉ set `deletedAt`); archived chỉ đọc; **staff không đổi `defaultReminders`/màu/`writeScope`/`archived`/xoá lịch**; exceptions; `calendarNotifications` chính chủ. `npm run test:emulator` xanh (133 ca / 10 file).

## 12. Tìm kiếm & bộ lọc (capability `calendar-search-and-filter`)

- [x] 12.1 Ô tìm kiếm toàn lịch. — ✅ `search.ts` (thuần, unit-test 9 ca): `normalizeSearchText` bỏ dấu + `đ→d` (khớp "ra mat" ↔ "Ra mắt"), `matchesSearchQuery` khớp AND từng token trên tiêu đề + mô tả + địa điểm + **tên người đảm nhận** (resolve qua `members`), `searchCalendarItems` xếp theo khoảng cách tới hiện tại (tương lai trước khi bằng khoảng cách). `useCalendarSearch`: một `getDocs(where deletedAt==null)` (không realtime), debounce 250ms. `CalendarSearchPanel` (dropdown dưới ô nhập): mỗi dòng có `TypeBadge` + tiêu đề + `AssigneeChips` + `formatItemTimeRange` + tên lịch con.
- [x] 12.2 Bấm kết quả + trạng thái rỗng. — ✅ `openSearchResult` (trong `CalendarPage`): `getDoc` → `setAnchor(startDay)` + `setView("day")` + mở **form chi tiết** mục (`ItemEditorForm`). ⚠️ **Lệch**: mở form chi tiết chứ không phải popover chỉ-đọc (popover `ItemPopover` gắn cứng với trigger; form hiện đủ mọi trường và là "form đầy đủ" popover dẫn tới). Rỗng → "Không tìm thấy mục nào". Kết quả tháng khác vẫn nhảy đúng (dùng `startDay` từ doc).
- [x] 12.3 Bộ lọc bền vững theo loại / người đảm nhận / dự án liên kết, kết hợp AND. — ✅ `CalendarFilterMenu` (Popover "Bộ lọc" + nút "Việc của tôi"): Loại (3 checkbox), Người đảm nhận (`MemberMultiSelect`), Dự án liên kết (`Select` từ `useMyProjects`). `itemMatchesFilters` AND các chiều. Bền vững qua `useCalendarFilters` (sessionStorage). Áp ở client trên `allItems` đã thu hẹp theo cửa sổ (`filteredItems` trong `CalendarPage`). `filters.test.ts` phủ "AND loại + assignee". **"Lọc theo lịch con" = cơ chế ẩn/hiện ở sidebar** (đã có, bền vững qua `userCalendarPrefs`) — không lặp lại thành chiều lọc riêng.
- [x] 12.4 Chỉ báo số bộ lọc + "xoá tất cả bộ lọc". — ✅ Badge số trên nút "Bộ lọc" (`activeFilterCount`); nút "Xoá tất cả bộ lọc" (`clearAll`) reset loại/assignee/dự án/mine — **KHÔNG** đụng ẩn/hiện lịch ở sidebar (khớp Scenario "về hiển thị đầy đủ theo các lịch con đang bật").
- [x] 12.5 Tìm kiếm bỏ qua ẩn/hiện + bộ lọc, ghi chú khi kết quả bị lọc ẩn. — ✅ Search query toàn bộ `deletedAt==null` (không đụng `visibleCalendars` hay `filters`). `searchCalendarItems` nhận `isHiddenByFilter = !itemMatchesFilters(row, filters, uid)` → hit bị lọc ẩn có nhãn hổ phách "Đang bị bộ lọc ẩn khỏi khung nhìn"; mở nó → toast "xoá bộ lọc để thấy nó trên khung nhìn". `search.test.ts` phủ cờ này.

**Lưu ý nhóm 12:** (a) ô tìm kiếm chỉ hiện trên desktop (`hidden sm:block`) — như ô cũ; (b) mỗi lần gõ = một `getDocs` toàn bộ mục chưa xoá (debounce 250ms) — chấp nhận ở quy mô một phòng; (c) `AssigneeFilter.tsx` (nhóm 9) đã xoá, `CalendarFilterMenu` thay thế.

## 13. Tích hợp, kiểm thử & triển khai

- [ ] 13.1 Cloud Function dọn `deletedAt` quá 30 ngày (scheduled hằng ngày) + Function cập nhật `dayCounts/{YYYY-MM-DD}` nếu chọn phương án đó cho khung Năm; verify mục xoá mềm biến mất sau ngưỡng, `dayCounts` khớp số ngày có mục.
- [ ] 13.2 Test E2E (Playwright) kịch bản chính: tạo mục kéo–thả, gán người đảm nhận, đặt lặp + sửa "chỉ mục này", nhận nhắc in-app (emulator giả thời gian), lọc "Việc của tôi", tìm kiếm; verify suite xanh trên CI.
- [ ] 13.3 Chạy các bước Migration Plan `design.md` trên môi trường staging (deploy rules + indexes + functions, backfill `members`, seed lịch, bật FCM); verify Trưởng phòng đăng nhập thấy 4 lịch dùng chung + lịch cá nhân và tạo được mục.
- [ ] 13.4 Rà chi phí đọc Firestore của một phiên xem 1 tháng và của rules `get()`; xác nhận trong ngưỡng chấp nhận hoặc chuyển `role` sang custom claims; ghi kết quả đo vào PR.
- [ ] 13.5 Chốt các Open Questions còn lại với Trưởng phòng (đường dẫn collection người dùng gốc, bật push v1, ngưỡng `spanDays`, phương án khung Năm) và cập nhật cấu hình tương ứng; verify không còn Open Question mở trong `design.md`.
