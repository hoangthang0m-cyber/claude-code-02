# Content Performance Tracker — Bản đặc tả hợp nhất (để triển khai)

> Tài liệu này gộp toàn bộ proposal + design + 7 spec + task list thành một file
> duy nhất để đưa cho trợ lý code (VS Code / web). Đọc theo thứ tự: mục 1–4 là bối
> cảnh & nền tảng dùng chung, mục 5 là đặc tả từng tính năng (WHAT), mục 6 là các
> quyết định kỹ thuật (HOW), mục 7 là checklist triển khai.
>
> Nguồn gốc: OpenSpec change `content-performance-tracker` tại
> `tasks-docs/openspec/changes/content-performance-tracker/`. File này là bản dẫn
> xuất; nếu sửa yêu cầu, sửa ở các file spec gốc rồi tạo lại bản gộp.

---

## 1. Mục tiêu & phạm vi

### 1.1 Vấn đề

Phòng marketing quản lý sản xuất nội dung và chạy ads bằng Google Sheets/Docs rời
rạc, giao việc lẫn trong file. Không có tiến độ thời gian thực, không tổng hợp
được hiệu quả theo tuần/tháng, số liệu ads (ROAS, CPP, CTR, Mess) phải chép tay từ
Facebook Ads Manager nên chậm và dễ sai.

### 1.2 Giải pháp

Một hệ thống web tập trung: quản lý dự án, theo dõi pipeline nội dung, kéo số liệu
ads tự động qua Meta Ads API, báo cáo tổng quan — **vẫn giữ Google Sheets/Docs**
qua đồng bộ 2 chiều (Sheets) và đính link (Docs).

### 1.3 Trong phạm vi

- Khái niệm **Dự án (Project)** với form khởi tạo chuẩn.
- **Pipeline nội dung**: mỗi dự án chứa nhiều hạng mục nội dung (video/bài).
- **Luồng trạng thái sản xuất** có 2 bước phê duyệt.
- **Tích hợp Meta (Facebook) Ads API** — kéo số liệu tự động.
- **Đồng bộ 2 chiều Google Sheets**.
- **Dashboard thời gian thực** + **báo cáo tuần/tháng** + so sánh kỳ.
- **Thông báo in-app** + cập nhật realtime.
- **2 vai trò**: Trưởng phòng, Nhân sự (nhãn phụ Content/Ads).

### 1.4 Ngoài phạm vi (không làm ở bản này)

- Không chọn sẵn tech stack cụ thể — đội triển khai tự quyết (xem 1.5).
- Không đọc/sửa nội dung Google Docs kịch bản — chỉ lưu URL.
- Không đồng bộ nhiều sheet cho một dự án (quan hệ 1–1).
- Không hỗ trợ nền tảng ads khác Meta (TikTok, Google Ads).
- Không phân quyền cấp trên Trưởng phòng (giám đốc xem chéo nhiều phòng).
- Không có kênh email/SMS.

### 1.5 Ghi chú tech stack

Tài liệu này không ràng buộc ngôn ngữ/framework. Vì đội đang xây dở một web app,
hãy khớp với stack hiện có. Các yêu cầu hạ tầng tối thiểu:

- CSDL quan hệ (mô hình ở mục 6.1 giả định quan hệ; JSON columns chấp nhận được).
- Cơ chế **job nền / scheduler** (cho đồng bộ Sheets và Ads).
- Một kênh **realtime** (WebSocket hoặc SSE); nếu chưa có, fallback polling
  10–15 giây cho màn hình đang mở — thiết kế API để đổi được sau.
- Lưu **secret/token bên thứ ba đã mã hoá at-rest**.

---

## 2. Vai trò & phân quyền

Hai vai trò, xét theo **phạm vi từng dự án** (`ProjectMember.project_role`), không
phải vai trò toàn cục cứng.

| Hành động | Trưởng phòng (manager) | Nhân sự (staff) |
|---|---|---|
| Tạo/sửa dự án, quản lý thành viên, gắn sheet, kết nối Ad Account | ✓ | ✗ |
| Tạo hạng mục nội dung | ✓ | ✓ (trong dự án mình là thành viên) |
| Gán người thực hiện | ✓ (bất kỳ thành viên) | ✓ chỉ tự nhận hạng mục chưa có người |
| Chuyển bước làm việc (viết→chờ duyệt, quay→chờ duyệt) | ✗ | ✓ (chỉ hạng mục mình thực hiện) |
| Duyệt / trả lại kịch bản & video | ✓ | ✗ |
| Gắn AdsBinding, nhập tay số ads, ghi đánh giá/đề xuất | ✓ | ✗ |
| Xem dashboard & báo cáo tuần/tháng cấp dự án | ✓ (dự án mình quản lý) | ✗ (chỉ thấy việc của mình) |
| Bình luận / @mention | ✓ | ✓ |

**Quy tắc kiểm tra phạm vi (dùng chung ở mọi tính năng):** so `Project` của đối
tượng đang thao tác với bản ghi `ProjectMember` của người dùng. Viết **một hàm
duy nhất** và tái sử dụng — đừng để mỗi module tự diễn giải.

Một dự án có thể có **nhiều thành viên vai trò manager** cùng cấp (để không phụ
thuộc một người khi cấp quyền Google/Meta).

---

## 3. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Dự án (Project)** | Đơn vị tổ chức cao nhất. Có form: mục tiêu, mô tả, quy mô, tiến độ (link Sheets), đúc kết. |
| **Hạng mục nội dung (ContentItem)** | Một video/bài — tương ứng một dòng trong sheet hiện tại. |
| **Luồng sản xuất** | Chuỗi 7 trạng thái từ "Chưa bắt đầu" đến "Đã lên ads". |
| **AdsBinding** | Liên kết một hạng mục với một đối tượng quảng cáo Meta (campaign/adset/ad). |
| **AdsMetric** | Một bản ghi số liệu ads theo thời điểm (append-only). |
| **SheetSyncMapping** | Cấu hình ánh xạ cột sheet ↔ trường hệ thống cho một dự án. |
| **Mess** | Số hội thoại nhắn tin bắt đầu từ quảng cáo (messaging conversations started). |
| **CPP** | Chi phí trên mỗi tin nhắn = chi phí / Mess. |
| **Cờ quá hạn** | Thuộc tính computed, không phải trạng thái: `deadline < now() AND status != da_len_ads`. |

---

## 4. Các trường của một hạng mục nội dung (khớp bảng đang dùng)

| Cột trong sheet hiện tại | Trường hệ thống | Bắt buộc | Ghi chú |
|---|---|---|---|
| (tên/mã) | `code` | ✓ | Khoá đối chiếu với dòng sheet |
| Deadline | `deadline` | – | Dùng để tính cờ quá hạn |
| Nhân sự thực hiện | `assignee_id` | – | Phải là thành viên dự án |
| Kịch bản | `script_url` | – | URL Google Docs, chỉ lưu link |
| Link video | `video_url` | – | URL, chỉ lưu link |
| Trạng thái | `status` | ✓ (mặc định) | Enum luồng sản xuất |
| Chủ đề | `topic` | – | Text tự do (vd: "Quay lại NYC", "Người thứ 3") |
| Link research khách hàng | `customer_research_url` | – | URL |
| Báo cáo hiệu quả ads | (dẫn xuất từ `AdsMetric`) | – | Xem 5.4 |
| Đánh giá / Đề xuất | `evaluation` | – | Text tự do, chỉ manager ghi |

---

## 5. Đặc tả tính năng (WHAT)

Ký hiệu: **SHALL** = yêu cầu bắt buộc. Mỗi requirement kèm các scenario dạng
WHEN/THEN — dùng trực tiếp làm test case.

### 5.1 Capability: `project-workspace`

**Mục đích:** Trưởng phòng tạo và quản lý các Dự án marketing như đơn vị tổ chức
cao nhất, với form khởi tạo chuẩn và quản lý thành viên/vai trò.

#### R1. Tạo dự án mới bằng form chuẩn

Hệ thống SHALL cung cấp nút "Tạo dự án mới" mở form với các trường: tên dự án
(bắt buộc), mục tiêu dự án (bắt buộc), mô tả chi tiết (tuỳ chọn), quy mô dự án
(tuỳ chọn), tiến độ dự án dưới dạng link Google Sheets ngoài (tuỳ chọn), đúc kết
sau dự án (tuỳ chọn).

- **WHEN** nhập tên + mục tiêu rồi lưu → **THEN** tạo dự án trạng thái "Đang chạy",
  gán người tạo là Trưởng phòng dự án, mở màn hình dự án.
- **WHEN** lưu mà thiếu tên hoặc mục tiêu → **THEN** từ chối, chỉ rõ trường thiếu.
- **WHEN** dán URL Google Sheets hợp lệ vào "tiến độ dự án" → **THEN** lưu link,
  xác thực quyền truy cập, bật đồng bộ 2 chiều (xem 5.5).
- **WHEN** URL không phải Sheets hoặc không có quyền đọc → **THEN** vẫn lưu dự án,
  cảnh báo link chưa dùng được, không bật đồng bộ.

#### R2. Chỉnh sửa thông tin dự án

Hệ thống SHALL cho phép Trưởng phòng của dự án sửa mọi trường của form sau khi tạo,
kể cả khi đang chạy.

- **WHEN** nhập "đúc kết sau dự án" và lưu → **THEN** lưu kèm thời điểm + người cập nhật.
- **WHEN** thay URL Sheets bằng URL khác hợp lệ → **THEN** ngắt ánh xạ sheet cũ,
  thiết lập ánh xạ mới.

#### R3. Vòng đời dự án

Hệ thống SHALL quản lý 3 trạng thái: "Đang chạy", "Hoàn thành", "Lưu trữ". Dự án
"Lưu trữ" chỉ đọc, không xuất hiện trong danh sách mặc định.

- **WHEN** chuyển sang "Hoàn thành" → **THEN** giữ nguyên dữ liệu, vẫn xem được báo
  cáo, nhắc điền "đúc kết" nếu trống.
- **WHEN** lưu trữ dự án → **THEN** ẩn khỏi danh sách mặc định, dừng mọi đồng bộ
  nền của dự án, chỉ mở chế độ đọc.

#### R4. Quản lý thành viên và vai trò

Hệ thống SHALL cho phép Trưởng phòng thêm/bớt thành viên và gán mỗi người một vai
trò ("Trưởng phòng" hoặc "Nhân sự") kèm nhãn chuyên môn tuỳ chọn ("Content" hoặc
"Ads").

- **WHEN** thêm người dùng với vai trò "Nhân sự" + nhãn "Content" → **THEN** người
  đó thấy dự án trong danh sách của mình, có thể được giao hạng mục.
- **WHEN** người không phải thành viên cố mở/sửa hạng mục của dự án → **THEN** từ chối.
- **WHEN** gỡ nhân sự đang là người thực hiện của hạng mục chưa hoàn thành →
  **THEN** cảnh báo, yêu cầu gán lại người thực hiện trước khi gỡ.

---

### 5.2 Capability: `content-pipeline`

**Mục đích:** Quản lý các hạng mục nội dung trong một dự án với đầy đủ trường theo
bảng đang dùng, và các cách xem/lọc phục vụ theo dõi hằng ngày.

#### R1. Trường thông tin của một hạng mục

Mỗi hạng mục SHALL có các trường ở mục 4. Chỉ `code` và dự án là bắt buộc khi tạo;
còn lại điền dần.

- **WHEN** tạo hạng mục chỉ với tên/mã + chọn dự án → **THEN** tạo ở trạng thái đầu
  tiên của luồng, chưa gán người, chưa có deadline.
- **WHEN** cập nhật deadline, chủ đề, dán link kịch bản → **THEN** lưu từng trường
  kèm thời điểm + người cập nhật, không ép điền trường khác.
- **WHEN** dán URL vào link kịch bản/video → **THEN** lưu URL, hiển thị dạng liên
  kết bấm được, không đọc/nhúng nội dung.

#### R2. Gán nhân sự thực hiện

Hệ thống SHALL cho phép gán hạng mục cho đúng một nhân sự là thành viên dự án;
Trưởng phòng gán cho bất kỳ ai, Nhân sự chỉ tự nhận hạng mục chưa có người.

- **WHEN** Trưởng phòng chọn nhân sự thuộc dự án làm người thực hiện → **THEN** lưu
  + tạo thông báo cho nhân sự đó.
- **WHEN** cố gán cho người ngoài dự án → **THEN** từ chối.

#### R3. Xem dạng bảng và Kanban

Hệ thống SHALL hiển thị các hạng mục của một dự án dạng bảng (mặc định) với các
cột tương ứng các trường, và cho phép chuyển sang Kanban theo cột trạng thái.

- **WHEN** mở dạng bảng → **THEN** mỗi hạng mục một dòng với các cột: deadline,
  nhân sự thực hiện, kịch bản, link video, trạng thái, chủ đề, link research khách
  hàng, báo cáo hiệu quả ads, đánh giá/đề xuất.
- **WHEN** bật Kanban → **THEN** mỗi hạng mục vào cột đúng theo trạng thái hiện tại.

#### R4. Lọc và sắp xếp

Hệ thống SHALL cho phép lọc theo nhân sự thực hiện, trạng thái, chủ đề, tình trạng
quá hạn; và sắp xếp theo deadline hoặc lần cập nhật gần nhất.

- **WHEN** lọc "nhân sự = Thắng" + "trạng thái = Chờ duyệt video" → **THEN** chỉ
  hiển thị hạng mục khớp cả hai.
- **WHEN** chọn bộ lọc "quá hạn" → **THEN** chỉ hiển thị hạng mục deadline đã qua
  và chưa ở trạng thái hoàn tất.

#### R5. Bình luận trên hạng mục

Hệ thống SHALL cho phép người thực hiện, Trưởng phòng, và người được @mention thêm
bình luận văn bản tự do, tách biệt với lịch sử thay đổi trạng thái.

- **WHEN** gõ bình luận và @mention một thành viên khác → **THEN** lưu kèm tác giả,
  thời gian, danh sách mention, gửi thông báo cho người được mention.

---

### 5.3 Capability: `production-workflow`

**Mục đích:** Luồng trạng thái sản xuất với 2 bước phê duyệt bắt buộc (kịch bản và
video) bởi Trưởng phòng, trả lại kèm lý do, lịch sử thay đổi, và cờ quá hạn.

#### Chuỗi trạng thái

```
chua_bat_dau → viet_kich_ban → cho_duyet_kich_ban → quay_dung
             → cho_duyet_video → da_duyet → da_len_ads

Trả lại: cho_duyet_kich_ban → viet_kich_ban   (kèm lý do bắt buộc)
         cho_duyet_video    → quay_dung        (kèm lý do bắt buộc)
```

Nhãn hiển thị gợi ý: Chưa bắt đầu · Viết kịch bản · Chờ duyệt kịch bản · Quay/Dựng
· Chờ duyệt video · Đã duyệt · Đã lên ads.

#### R1. Chuỗi trạng thái sản xuất

Hệ thống SHALL chỉ cho phép chuyển trạng thái theo các bước hợp lệ ở trên.

- **WHEN** người thực hiện chuyển `chua_bat_dau` → `viet_kich_ban` → **THEN** cập
  nhật + ghi lịch sử.
- **WHEN** cố chuyển thẳng `quay_dung` → `da_duyet` → **THEN** từ chối (thiếu bước
  chờ duyệt video).
- **WHEN** một yêu cầu chuyển trạng thái không hợp lệ được gửi tới hệ thống kể cả
  khi bỏ qua giao diện → **THEN** từ chối **ở phía máy chủ**, không đổi trạng thái.

#### R2. Gửi kịch bản và video để duyệt

Hệ thống SHALL cho phép người thực hiện chuyển sang `cho_duyet_kich_ban` (từ
`viet_kich_ban`) và `cho_duyet_video` (từ `quay_dung`); mỗi lần gửi duyệt SHALL
yêu cầu trường link tương ứng đã có giá trị.

- **WHEN** đã dán link kịch bản và chuyển sang `cho_duyet_kich_ban` → **THEN** cập
  nhật + thông báo Trưởng phòng dự án.
- **WHEN** chuyển sang `cho_duyet_video` mà `video_url` trống → **THEN** từ chối,
  yêu cầu bổ sung link video.

#### R3. Phê duyệt và trả lại bởi Trưởng phòng

Hệ thống SHALL chỉ cho phép Trưởng phòng dự án duyệt/trả lại hạng mục đang ở
`cho_duyet_kich_ban` hoặc `cho_duyet_video`. Duyệt kịch bản → `quay_dung`; duyệt
video → `da_duyet`. Trả lại → bước làm việc liền trước, SHALL yêu cầu lý do.

- **WHEN** duyệt hạng mục ở `cho_duyet_kich_ban` → **THEN** → `quay_dung` + thông
  báo người thực hiện.
- **WHEN** trả lại hạng mục ở `cho_duyet_video` kèm lý do → **THEN** → `quay_dung`,
  lưu lý do, thông báo người thực hiện.
- **WHEN** trả lại không nhập lý do → **THEN** từ chối.
- **WHEN** một Nhân sự cố duyệt/trả lại → **THEN** từ chối (không đủ quyền).

#### R4. Đánh dấu "Đã lên ads"

Hệ thống SHALL cho phép `da_duyet` → `da_len_ads` khi hạng mục đã gắn ít nhất một
campaign/ad Meta (xem 5.4) **hoặc** khi Trưởng phòng xác nhận thủ công.

- **WHEN** hạng mục `da_duyet` được gắn với một ad đang chạy → **THEN** cho phép
  chuyển + bắt đầu đồng bộ số liệu.
- **WHEN** Trưởng phòng đánh dấu "Đã lên ads" cho hạng mục chưa gắn campaign →
  **THEN** chuyển trạng thái + nhắc gắn campaign để có số liệu tự động.

#### R5. Lịch sử thay đổi trạng thái

Hệ thống SHALL ghi mỗi lần chuyển: trạng thái trước, trạng thái sau, người thực
hiện, lý do (nếu trả lại), thời điểm. Tách biệt với bình luận.

- **WHEN** mở tab lịch sử của hạng mục → **THEN** hiển thị các lần chuyển theo thứ
  tự thời gian, kèm người thực hiện + lý do trả lại nếu có.

#### R6. Cờ quá hạn tính từ deadline

Hệ thống SHALL đánh dấu "quá hạn" khi `deadline < now() AND status != da_len_ads`,
song song trạng thái chính, tính tại thời điểm truy vấn, không lưu như status.

- **WHEN** ngày hiện tại vượt deadline của hạng mục ở `quay_dung` → **THEN** hiển
  thị cờ "quá hạn" trên bảng, Kanban, dashboard.
- **WHEN** dời deadline sang tương lai → **THEN** bỏ cờ ngay lần hiển thị kế tiếp.
- **WHEN** deadline đã qua nhưng hạng mục đã `da_len_ads` → **THEN** không tính quá hạn.

---

### 5.4 Capability: `ads-performance`

**Mục đích:** Gắn hạng mục với chiến dịch Meta Ads, tự đồng bộ chỉ số qua Facebook
Ads API, cho nhập tay khi cần, và ghi đánh giá/đề xuất.

#### R1. Kết nối tài khoản quảng cáo Meta

Hệ thống SHALL cho phép Trưởng phòng kết nối một/nhiều Ad Account qua OAuth với
quyền đọc số liệu quảng cáo; token SHALL lưu mã hoá và làm mới tự động khi hết hạn.

- **WHEN** hoàn tất uỷ quyền và chọn một Ad Account → **THEN** lưu kết nối, hiển thị
  "Đã kết nối", cho chọn Ad Account này khi gắn campaign.
- **WHEN** gọi Ads API nhận lỗi token không hợp lệ → **THEN** đánh dấu "Cần kết nối
  lại", dừng đồng bộ tài khoản đó, thông báo Trưởng phòng.

#### R2. Gắn hạng mục với campaign/ad

Hệ thống SHALL cho phép gắn một hạng mục với một/nhiều đối tượng quảng cáo
(campaign, ad set, hoặc ad) thuộc Ad Account đã kết nối; hạng mục không gắn gì thì
số liệu rỗng.

- **WHEN** chọn một ad và gắn vào hạng mục → **THEN** lưu ánh xạ + lên lịch đồng bộ.
- **WHEN** hạng mục gắn 2 ad khác nhau → **THEN** tổng hợp số liệu (cộng chi phí,
  cộng Mess, tính lại ROAS/CPP/CTR theo tổng) khi hiển thị.
- **WHEN** gỡ liên kết giữa hạng mục và một ad → **THEN** dừng đồng bộ phần đó, giữ
  số liệu lịch sử, đánh dấu "đã ngừng cập nhật".

#### R3. Đồng bộ chỉ số qua Facebook Ads API

Hệ thống SHALL đồng bộ định kỳ cho mỗi hạng mục có ánh xạ, tối thiểu: chi phí, Mess
(messaging conversations started), CPP, ROAS, CTR, ngày bắt đầu chạy ads, trạng
thái phân phối của ad (đang chạy / tạm dừng / hoàn tất). Chu kỳ SHALL không quá 6
giờ/lần cho mỗi hạng mục đang hoạt động.

- **WHEN** đến chu kỳ đồng bộ của hạng mục đang chạy ads → **THEN** gọi Ads API, cập
  nhật chỉ số kèm mốc "số liệu tính đến", hiển thị trong ô "báo cáo hiệu quả ads".
- **WHEN** đồng bộ phát hiện trạng thái ad chuyển "tạm dừng"/"hoàn tất" → **THEN**
  cập nhật trạng thái ads của hạng mục + tạo thông báo "ads đã dừng" cho Trưởng phòng.
- **WHEN** một lần gọi API thất bại do mạng/rate limit → **THEN** giữ số liệu gần
  nhất, thử lại lùi dần, chỉ báo lỗi nếu thất bại kéo dài quá 24 giờ.

#### R4. Nhập tay và ghi đè số liệu ads

Hệ thống SHALL cho phép Trưởng phòng nhập tay các chỉ số cho một hạng mục, và SHALL
đánh dấu rõ giá trị nào là nhập tay so với đồng bộ tự động.

- **WHEN** nhập tay ROAS, CPP, Mess, CTR cho hạng mục chưa có ánh xạ ads → **THEN**
  lưu, gắn nhãn "nhập tay" kèm thời điểm.
- **WHEN** hạng mục có số nhập tay rồi được gắn campaign và đồng bộ thành công →
  **THEN** hiển thị số đồng bộ làm giá trị chính, giữ số nhập tay trong lịch sử.

#### R5. Đánh giá / đề xuất

Hệ thống SHALL cung cấp trên mỗi hạng mục trường văn bản tự do "đánh giá / đề xuất"
để Trưởng phòng ghi nhận xét (vd: duy trì, dừng ads, sửa nội dung).

- **WHEN** nhập nội dung vào trường và lưu → **THEN** lưu kèm thời điểm + người ghi,
  hiển thị ở cột tương ứng trên bảng.

---

### 5.5 Capability: `sheets-sync`

**Mục đích:** Giữ dữ liệu dự án và hạng mục đồng bộ 2 chiều với Google Sheets ngoài
để đội tiếp tục làm việc trên Sheets, trong khi hệ thống là nơi tổng hợp/báo cáo.

#### R1. Ánh xạ sheet với dự án

Hệ thống SHALL cho phép mỗi dự án gắn với đúng một Google Sheet (một tab cụ thể)
làm nguồn tiến độ, và lưu cấu hình ánh xạ giữa các cột sheet và các trường hạng mục.

- **WHEN** gắn sheet, chọn dòng tiêu đề, ánh xạ "Deadline" → deadline, "Nhân sự
  thực hiện" → người thực hiện, "Trạng thái" → trạng thái sản xuất, v.v. →
  **THEN** lưu cấu hình + thực hiện lần đồng bộ đầu tiên.
- **WHEN** một ô "Trạng thái" trong sheet chứa giá trị không nằm trong chuỗi trạng
  thái → **THEN** bỏ qua cập nhật trường đó cho dòng đó, ghi log cảnh báo, hiển thị
  số dòng lỗi ánh xạ ở màn hình đồng bộ.

#### R2. Đồng bộ 2 chiều theo chu kỳ

Hệ thống SHALL đồng bộ 2 chiều theo chu kỳ (không quá 5 phút/lần cho mỗi dự án
đang hoạt động) và khi bấm "đồng bộ ngay". Thay đổi ở hệ thống ghi xuống sheet;
thay đổi ở sheet đọc vào hệ thống.

- **WHEN** đổi deadline một hạng mục trong hệ thống → **THEN** chu kỳ kế tiếp, ô
  deadline tương ứng trong sheet được cập nhật.
- **WHEN** thêm một dòng mới có tên/mã hạng mục trong sheet → **THEN** tạo một hạng
  mục nội dung mới trong dự án đó với các trường lấy từ dòng sheet theo ánh xạ.
- **WHEN** một dòng đã đồng bộ bị xoá khỏi sheet → **THEN** KHÔNG xoá hạng mục
  tương ứng, đánh dấu "mất liên kết sheet", báo Trưởng phòng.

#### R3. Phát hiện và xử lý xung đột

Khi cùng một trường của cùng một hạng mục bị đổi ở cả hệ thống lẫn sheet giữa hai
lần đồng bộ, hệ thống SHALL phát hiện xung đột và áp quy tắc ưu tiên đã cấu hình
(mặc định: **hệ thống thắng**), đồng thời ghi lại giá trị bị ghi đè.

- **WHEN** deadline bị đổi khác nhau ở hệ thống và sheet trong cùng khoảng giữa hai
  lần đồng bộ → **THEN** giữ giá trị theo quy tắc ưu tiên mặc định, ghi giá trị của
  sheet vào nhật ký xung đột, hiển thị cảnh báo.
- **WHEN** mở nhật ký đồng bộ của một dự án → **THEN** liệt kê các xung đột gần đây
  kèm trường, giá trị mỗi bên, bên được chọn, thời điểm.

#### R4. Trạng thái và nhật ký đồng bộ

Hệ thống SHALL hiển thị cho mỗi dự án: thời điểm đồng bộ gần nhất, kết quả (thành
công / có cảnh báo / lỗi), số dòng đã đọc/ghi, và cho phép tắt đồng bộ cho dự án đó.

- **WHEN** mất quyền đọc/ghi sheet của một dự án → **THEN** đánh dấu "lỗi", dừng các
  lần đồng bộ tiếp theo, thông báo Trưởng phòng để cấp lại quyền.
- **WHEN** tắt đồng bộ cho một dự án → **THEN** ngừng mọi tác vụ đồng bộ nền của dự
  án, giữ nguyên dữ liệu hiện có ở cả hai bên.

> **Lưu ý nguồn sự thật:** số liệu ads chỉ **đẩy một chiều xuống sheet**, không bao
> giờ đọc ngược từ sheet (xem bảng 6.2).

---

### 5.6 Capability: `progress-analytics`

**Mục đích:** Cho Trưởng phòng cái nhìn tiến độ thời gian thực và báo cáo tổng quan
theo tuần/tháng về sản lượng nội dung, mức đúng hạn, khối lượng theo nhân sự, và
hiệu quả ads.

#### R1. Dashboard tiến độ thời gian thực

Hệ thống SHALL hiển thị cho Trưởng phòng một dashboard tổng hợp trên các dự án mình
quản lý, cập nhật thời gian thực, gồm tối thiểu: tổng số hạng mục, số đang sản
xuất, số chờ duyệt (kịch bản + video), số quá hạn, số đã lên ads, số ads đang chạy.

- **WHEN** mở dashboard → **THEN** hiển thị các chỉ số nói trên, tính từ hạng mục
  thuộc dự án Trưởng phòng đó quản lý.
- **WHEN** một hạng mục chuyển sang "Chờ duyệt video" trong lúc dashboard đang mở →
  **THEN** các chỉ số liên quan cập nhật trong vài giây, không cần tải lại trang.
- **WHEN** một Nhân sự mở màn hình tổng quan → **THEN** chỉ hiển thị số liệu các
  hạng mục được giao cho người đó, không có dashboard cấp dự án/phòng.

#### R2. Khối lượng và tiến độ theo nhân sự

Hệ thống SHALL hiển thị danh sách nhân sự kèm: số hạng mục đang thực hiện, số đã
hoàn tất trong kỳ đang xem, số quá hạn, thời gian trung bình từ lúc nhận việc đến
lúc "Đã duyệt".

- **WHEN** mở phần "theo nhân sự" → **THEN** mỗi nhân sự một dòng với các số nói
  trên, đánh dấu nhân sự đang có hạng mục quá hạn.
- **WHEN** bấm vào một nhân sự → **THEN** mở danh sách hạng mục của người đó, có sẵn
  bộ lọc theo trạng thái.

#### R3. Báo cáo tổng quan theo tuần và theo tháng

Hệ thống SHALL tạo báo cáo cho một khoảng thời gian (tuần hoặc tháng) gồm: số hạng
mục đã lên ads trong kỳ (throughput), tỷ lệ đúng hạn, số lần trả lại duyệt, tổng
chi phí ads, tổng Mess, ROAS trung bình có trọng số theo chi phí, top hạng mục
theo ROAS.

- **WHEN** chọn "báo cáo tuần" cho một tuần cụ thể → **THEN** hiển thị các chỉ số
  của kỳ đó, tính từ hạng mục và số liệu ads thuộc phạm vi quản lý.
- **WHEN** chọn một kỳ chưa có hạng mục nào lên ads → **THEN** hiển thị báo cáo với
  các chỉ số bằng 0 và ghi rõ "chưa có dữ liệu trong kỳ".

#### R4. So sánh giữa các kỳ

Hệ thống SHALL cho phép so sánh báo cáo một kỳ với kỳ liền trước, hiển thị mức
tăng/giảm tuyệt đối và theo phần trăm cho từng chỉ số.

- **WHEN** bật chế độ so sánh trên báo cáo tháng → **THEN** mỗi chỉ số hiển thị kèm
  chênh lệch so với tháng trước và hướng thay đổi.

#### R5. Xuất báo cáo

Hệ thống SHALL cho phép xuất báo cáo tuần/tháng và bảng "theo nhân sự" ra CSV hoặc
Excel.

- **WHEN** bấm "xuất" trên báo cáo tháng và chọn Excel → **THEN** tạo tệp chứa các
  chỉ số của báo cáo đang xem và cho tải về.

---

### 5.7 Capability: `notifications`

**Mục đích:** Giữ mọi người liên quan cập nhật kịp thời qua thông báo in-app theo
sự kiện, và cập nhật realtime cho bảng nội dung và dashboard.

#### R1. Thông báo theo sự kiện

Hệ thống SHALL tạo thông báo in-app cho đúng người nhận:

| Sự kiện | Người nhận |
|---|---|
| Được giao một hạng mục nội dung | người thực hiện |
| Hạng mục chuyển sang "Chờ duyệt kịch bản" / "Chờ duyệt video" | Trưởng phòng dự án |
| Duyệt xong hoặc trả lại | người thực hiện |
| Hạng mục trở thành quá hạn | người thực hiện + Trưởng phòng dự án |
| Ads của hạng mục bị dừng phân phối | Trưởng phòng dự án |
| Bình luận mới trên hạng mục | những người liên quan hạng mục (trừ tác giả) |
| @mention trong bình luận | người được mention |
| Đồng bộ Google Sheets báo lỗi hoặc có xung đột | Trưởng phòng dự án |

- **WHEN** gán một hạng mục cho nhân sự → **THEN** tạo thông báo in-app cho nhân sự
  đó kèm liên kết tới hạng mục.
- **WHEN** đồng bộ Ads phát hiện ad chuyển tạm dừng/hoàn tất → **THEN** tạo thông
  báo "ads đã dừng" cho Trưởng phòng dự án đó.
- **WHEN** Trưởng phòng tự viết một bình luận → **THEN** không tạo thông báo bình
  luận mới cho chính người đó.

#### R2. Chuông thông báo và đánh dấu đã đọc

Hệ thống SHALL hiển thị chuông với badge số chưa đọc; mở một thông báo SHALL đánh
dấu đã đọc và điều hướng đến đối tượng liên quan (hạng mục, dự án, hoặc màn hình
đồng bộ).

- **WHEN** có 5 thông báo chưa đọc → **THEN** chuông hiển thị badge "5".
- **WHEN** bấm vào thông báo "được giao việc" → **THEN** đánh dấu đã đọc + mở màn
  hình chi tiết hạng mục tương ứng.
- **WHEN** bấm "đánh dấu tất cả đã đọc" → **THEN** badge về 0.

#### R3. Cập nhật realtime cho bảng và dashboard

Hệ thống SHALL đẩy cập nhật gần thời gian thực (trong vài giây) tới các màn hình
đang mở khi có thay đổi liên quan: trạng thái hạng mục, người thực hiện, deadline,
số liệu ads, chỉ số dashboard.

- **WHEN** một nhân sự chuyển hạng mục sang "Chờ duyệt video" trong khi Trưởng
  phòng đang mở bảng nội dung cùng dự án → **THEN** dòng của hạng mục đó đổi trạng
  thái mà không cần tải lại trang.
- **WHEN** kênh realtime của một phiên bị gián đoạn → **THEN** tự kết nối lại và
  đồng bộ lại dữ liệu hiển thị khi khôi phục, không để dữ liệu cũ mà không cảnh báo.

#### R4. Tuỳ chọn nhận thông báo

Hệ thống SHALL cho phép mỗi người bật/tắt từng nhóm thông báo (giao việc, duyệt,
quá hạn, ads, bình luận/mention, đồng bộ) trong phạm vi in-app.

- **WHEN** một nhân sự tắt nhóm "bình luận/mention" → **THEN** ngừng tạo thông báo
  nhóm đó cho người này, các nhóm khác không đổi.

---

## 6. Quyết định kỹ thuật (HOW)

### 6.1 Data model

```text
User (id, name, email, system_role: manager | staff)

Project (
  id, name, objective, description, scale,
  progress_sheet_url,            -- link Google Sheets tiến độ (nullable)
  retrospective,                 -- đúc kết sau dự án (nullable)
  lifecycle: running | done | archived,
  created_by
)

ProjectMember (id, project_id, user_id, project_role: manager | staff,
               skill_tag: content | ads | null)

ContentItem (
  id, project_id, code,
  deadline nullable,
  assignee_id nullable,                      -- User.id, phải là ProjectMember của project
  script_url nullable,                       -- link Google Docs
  video_url nullable,
  topic nullable,
  customer_research_url nullable,
  status: chua_bat_dau | viet_kich_ban | cho_duyet_kich_ban
        | quay_dung | cho_duyet_video | da_duyet | da_len_ads,
  evaluation nullable,                       -- đánh giá / đề xuất (nhập tay)
  sheet_row_ref nullable,                    -- khoá đối chiếu dòng sheet
  created_at, updated_at
)

StatusHistory (id, content_item_id, from_status, to_status, actor_id,
               reason nullable, created_at)

Comment (id, content_item_id, author_id, body, mentions: User[], created_at)

AdAccountConnection (id, project_owner_id, ad_account_id, name,
                     token_encrypted, token_expires_at,
                     state: connected | needs_reconnect)

AdsBinding (id, content_item_id, ad_account_id,
            object_level: campaign | adset | ad, object_id)

AdsMetric (
  id, content_item_id,
  source: synced | manual,
  spend, messages, cost_per_purchase, roas, ctr,   -- CPP = cost/purchase (Q1)
  ads_started_on nullable,
  delivery_status: active | paused | completed | unknown,
  data_as_of,                               -- mốc thời gian số liệu
  captured_at
)

SheetSyncMapping (id, project_id, spreadsheet_id, sheet_tab, header_row,
                  column_map: {field -> column},
                  conflict_rule: system_wins | sheet_wins)

SyncRun (id, project_id, kind: sheets | ads, started_at, finished_at,
         result: ok | warning | error, rows_read, rows_written, message)

SyncConflict (id, project_id, content_item_id, field,
              system_value, sheet_value, chosen_side, created_at)

Notification (id, recipient_id, type, content_item_id nullable,
              project_id nullable, message, read_at nullable, created_at)

NotificationPreference (id, user_id, group, enabled)
```

Nguyên tắc:

- `ContentItem` là **bảng phẳng chứa mọi trường của "dòng sheet"** (kể cả URL) →
  ánh xạ sheet ↔ hệ thống là 1–1 theo trường, tránh join nhiều bảng mỗi lần đồng bộ.
- `AdsMetric` là **bản ghi theo thời gian (append-only)**, không update tại chỗ.
  Giá trị "hiện tại" của một hạng mục = bản ghi `synced` mới nhất, fallback về
  `manual` mới nhất nếu chưa có `synced`.
- `AdsBinding` tách khỏi `ContentItem` vì một hạng mục có thể gắn nhiều ad — tổng
  hợp khi đọc.
- Phê duyệt do **bất kỳ `ProjectMember` có `project_role = manager`** thực hiện,
  không cố định vào người tạo hạng mục (nhiều hạng mục do nhân sự tự tạo từ sheet).

**Thay thế đã cân nhắc và loại bỏ:** gộp `AdsMetric` thành các cột trực tiếp trên
`ContentItem` (như sheet hiện tại) — mất khả năng báo cáo theo kỳ và không phân
biệt được nguồn số liệu.

### 6.2 Nguồn sự thật theo trường (quy tắc đồng bộ cốt lõi)

| Nhóm trường | Hệ thống ghi | Sheet ghi | Ads API ghi |
|---|---|---|---|
| `code`, `deadline`, `assignee`, `topic`, `script_url`, `video_url`, `customer_research_url` | ✓ | ✓ (2 chiều) | ✗ |
| `status` | ✓ (qua workflow) | ✓ đọc vào, chỉ chấp nhận giá trị hợp lệ | ✗ |
| `evaluation`, `retrospective`, `objective`, `description`, `scale` | ✓ | đọc/ghi nếu có cột ánh xạ | ✗ |
| `spend`, `messages`, `cost_per_purchase`, `roas`, `ctr`, `ads_started_on`, `delivery_status` | chỉ khi `source = manual` | ✗ (chỉ ghi xuống sheet, **không đọc lên**) | ✓ (`source = synced`) |

Số liệu ads **đẩy xuống sheet một chiều** để cột "báo cáo hiệu quả ads" trên sheet
vẫn có dữ liệu, nhưng không bao giờ đọc ngược (tránh số máy móc bị ghi đè bởi số
chép tay cũ).

### 6.3 Đồng bộ Google Sheets

- **Cơ chế:** mỗi `Project` có `progress_sheet_url` → parse `spreadsheet_id` +
  `sheet_tab`. Job nền chạy mỗi ≤ 5 phút cho project `running`, cộng nút "đồng bộ
  ngay".
- **Đối chiếu dòng:** dùng `sheet_row_ref` — ưu tiên một cột "mã hạng mục" trong
  sheet làm khoá tự nhiên; nếu không có, dùng số thứ tự dòng + checksum để phát
  hiện dịch dòng.
- **Chiều hệ thống → sheet:** ghi theo ô, chỉ các ô có ánh xạ.
- **Chiều sheet → hệ thống:** đọc toàn bảng, so với snapshot lần đồng bộ trước để
  tính delta.
- **Xung đột:** nếu cùng field đổi cả hai bên kể từ `SyncRun` trước → áp
  `conflict_rule` (mặc định `system_wins`), ghi `SyncConflict`.
- **Xoá dòng ở sheet:** không xoá `ContentItem`, đánh dấu `sheet_row_ref = null` +
  cờ "mất liên kết", báo Trưởng phòng.
- **Google API:** OAuth với refresh token của Trưởng phòng (không service account)
  để quyền truy cập bám theo quyền thật của người đó trên sheet.

**Thay thế đã cân nhắc và loại bỏ:** Google Apps Script / webhook đẩy từ sheet —
phụ thuộc script sống trong từng file, khó vận hành tập trung. Polling phía server
đơn giản và đủ nhanh (độ trễ vài phút chấp nhận được).

### 6.4 Tích hợp Meta Ads API

- **Kết nối:** `AdAccountConnection` lưu long-lived user token (hoặc System User
  token) đã mã hoá; job làm mới trước khi hết hạn.
- **Đồng bộ:** job nền theo từng `ContentItem` có `AdsBinding` active, chu kỳ ≤ 6
  giờ khi `delivery_status = active` (dự án `running`), giãn ra khi
  `paused/completed`; dự án `done` chu kỳ ~24 giờ; `archived` dừng hẳn (Q5). Gọi
  Insights API theo `object_id` với các trường: `spend`, `actions`
  (`messaging_conversation_started` → messages, attribution mặc định Meta — Q1),
  `cost_per_action_type` (`omni_purchase` → CPP), `purchase_roas`, `ctr`,
  `date_start`.
- **Rate limit / lỗi:** retry lùi dần theo cấp số nhân; giữ `AdsMetric` gần nhất;
  chỉ báo lỗi ra người dùng nếu fail liên tục > 24 giờ. Đánh dấu
  `AdAccountConnection.state = needs_reconnect` khi token hỏng và dừng đồng bộ tài
  khoản đó.
- **Nhiều ad trên một hạng mục:** cộng `spend`, `messages`, `purchases`;
  `cost_per_purchase = tổng spend / tổng purchases`; `roas`, `ctr` tính lại có
  trọng số theo `spend`.
- **Chuyển "Đã lên ads":** cho phép khi có `AdsBinding` với ad `active`, hoặc
  Trưởng phòng xác nhận thủ công.

### 6.5 Phân quyền

Xem bảng ở mục 2. Kiểm tra phạm vi = so `Project` của đối tượng với `ProjectMember`
của người thao tác; **một hàm chung dùng lại ở mọi tính năng**.

### 6.6 Realtime vs thông báo — hai kênh tách biệt

- **Realtime (dashboard, bảng nội dung):** WebSocket/SSE theo "phòng" là
  `project_id`; server phát sự kiện thay đổi `ContentItem` / chỉ số dashboard. Nếu
  hạ tầng realtime chưa sẵn sàng, fallback polling 10–15 giây cho màn hình đang mở.
- **Thông báo in-app:** ghi `Notification` vào DB theo bảng sự kiện → người nhận
  (mục 5.7 R1), client lấy qua polling 30 giây + đẩy kèm kênh realtime nếu có. Tách
  biệt để lịch sử thông báo không phụ thuộc kết nối realtime.

### 6.7 "Quá hạn" và các chỉ số kỳ — computed

`is_overdue = deadline < now() AND status != da_len_ads`, tính khi truy vấn. Các
chỉ số báo cáo tuần/tháng tính từ `StatusHistory` (throughput, số lần trả lại,
thời gian chuyển bước) và `AdsMetric` trong khoảng thời gian. Không lưu bảng tổng
hợp riêng ở phạm vi này (thêm bảng rollup sau nếu báo cáo chậm).

### 6.8 Rủi ro & đánh đổi

- **Đồng bộ 2 chiều Sheets dễ sinh xung đột / vòng lặp ghi đè** khi nhiều người sửa
  cùng lúc → delta theo snapshot, quy tắc ưu tiên rõ ràng (mặc định `system_wins`),
  `SyncConflict` để soi lại; số liệu ads chỉ đẩy một chiều xuống sheet.
- **Số "messages" / "CPP" từ Ads API có thể lệch cách phòng đang hiểu** (tuỳ chọn
  tối ưu chiến dịch, cửa sổ quy đổi) → ghi rõ `data_as_of`, cho nhập tay ghi đè,
  tài liệu hoá mapping action type; **chốt định nghĩa với Trưởng phòng trước khi
  build** (mục 8).
- **Token Meta/Google hết hạn hoặc bị thu hồi làm gãy đồng bộ âm thầm** → trạng
  thái kết nối hiển thị rõ, thông báo chủ động, job tự dừng và không xoá dữ liệu.
- **Rate limit Meta Ads API khi số hạng mục lớn** → gom truy vấn theo Ad Account,
  chu kỳ 6 giờ, giãn chu kỳ cho ad đã dừng, retry lùi dần.
- **Phụ thuộc quyền cá nhân của Trưởng phòng cho Google Sheets** → cho nhiều
  `ProjectMember` role manager cùng cấp quyền; tài liệu hoá cách chuyển chủ sở hữu.
- **[Đánh đổi]** Polling/6h cho Ads thay vì realtime → số liệu ads trễ tới vài giờ.
  Chấp nhận được vì quyết định dừng/duy trì ads không tính theo phút.

### 6.9 Triển khai lần đầu

Hệ thống mới, không có dữ liệu cũ cần di trú.

1. Seed tài khoản Trưởng phòng đầu tiên.
2. Trưởng phòng tạo dự án, thêm thành viên.
3. Với mỗi dự án đang chạy trên sheet: gắn `progress_sheet_url`, cấu hình
   `SheetSyncMapping` (ánh xạ cột theo đúng bảng hiện tại: Deadline, Nhân sự thực
   hiện, Kịch bản, Link video, Trạng thái, Chủ đề, Link research khách hàng, Báo
   cáo hiệu quả ads, Đánh giá/Đề xuất), chạy đồng bộ lần đầu để nạp dữ liệu.
4. Kết nối Ad Account, gắn `AdsBinding` cho các hạng mục đã lên ads.
5. Bật đồng bộ nền.

Rollback: tắt đồng bộ ở cấp dự án; sheet vẫn giữ nguyên là nguồn làm việc.

---

## 7. Checklist triển khai

Mỗi task đủ nhỏ để làm trong một phiên; kèm cách verify. Làm theo thứ tự nhóm.

### 7.1 Nền tảng dữ liệu & phân quyền

- [x] 1.1 Khởi tạo/khớp cấu trúc module theo tech stack hiện có; verify build/chạy được khung
- [x] 1.2 Schema/migration cho User, Project, ProjectMember, ContentItem, StatusHistory, Comment (mục 6.1); verify migration lên/xuống sạch
- [x] 1.3 Schema/migration cho AdAccountConnection, AdsBinding, AdsMetric, SheetSyncMapping, SyncRun, SyncConflict, Notification, NotificationPreference; verify migration sạch
- [x] 1.4 Xác thực người dùng + `system_role`; verify đăng nhập và đọc được vai trò trong request
- [x] 1.5 Hàm kiểm tra quyền dùng chung theo phạm vi dự án (mục 6.5); verify unit test manager/staff/không phải thành viên
- [x] 1.6 Seed một tài khoản Trưởng phòng khởi tạo; verify đăng nhập + tạo dự án được

### 7.2 Project workspace

- [x] 2.1 API tạo dự án với form chuẩn (name, objective bắt buộc); verify test từ chối khi thiếu name/objective
- [x] 2.2 API sửa dự án (mọi trường form) + cập nhật `retrospective`; verify lưu kèm người/thời điểm
- [x] 2.3 API vòng đời running → done → archived; verify archived chỉ đọc + dừng job nền của dự án
- [x] 2.4 API quản lý thành viên (thêm/bớt, `project_role`, `skill_tag`); verify chặn gỡ thành viên còn là assignee của hạng mục chưa xong
- [x] 2.5 Giới hạn API mục 7.2 cho `project_role = manager` (trừ xem); verify test phân quyền
- [x] 2.6 Màn hình "Tạo dự án mới" + màn hình dự án; verify tạo dự án end-to-end qua UI

### 7.3 Content pipeline

- [x] 3.1 API tạo hạng mục (chỉ `code` + `project_id` bắt buộc); verify tạo ở trạng thái `chua_bat_dau`
- [x] 3.2 API cập nhật từng trường hạng mục; verify lưu độc lập kèm audit updated_at/actor
- [x] 3.3 API gán người thực hiện (manager gán bất kỳ / staff tự nhận hạng mục trống); verify từ chối gán người ngoài dự án
- [x] 3.4 API danh sách + lọc (assignee, status, topic, overdue) + sắp xếp (deadline, updated_at); verify từng bộ lọc
- [x] 3.5 API bình luận + @mention, tách khỏi StatusHistory; verify lưu mentions + phát sự kiện thông báo
- [x] 3.6 Màn hình bảng nội dung đủ cột (mục 5.2 R3); verify hiển thị + sửa inline
- [x] 3.7 Màn hình Kanban theo cột trạng thái (toggle từ bảng); verify hạng mục đúng cột

### 7.4 Production workflow

- [x] 4.1 State machine 7 trạng thái + các bước hợp lệ (mục 5.3); verify unit test mọi chuyển hợp lệ/không hợp lệ
- [x] 4.2 Chặn chuyển trạng thái không hợp lệ ở tầng server; verify gọi API trực tiếp bị từ chối
- [x] 4.3 API staff chuyển bước làm việc với ràng buộc link tương ứng đã có; verify thiếu link bị chặn
- [x] 4.4 API manager duyệt (cho_duyet_* → bước sau); verify chỉ manager dự án làm được
- [x] 4.5 API manager trả lại về bước trước với lý do bắt buộc; verify trả lại thiếu lý do bị từ chối
- [x] 4.6 API `da_duyet` → `da_len_ads` khi có AdsBinding active hoặc manager xác nhận thủ công; verify cả hai đường
- [x] 4.7 Ghi StatusHistory mọi lần chuyển (from/to, actor, reason); verify tab lịch sử đúng thứ tự thời gian
- [x] 4.8 Computed `is_overdue` (mục 6.7); verify test các mốc biên (đúng hạn, quá hạn, đã lên ads, đổi deadline)
- [x] 4.9 Hiển thị cờ quá hạn nhất quán trên bảng, Kanban, dashboard; verify quan sát cả 3 màn hình

### 7.5 Ads performance (Meta Ads API)

- [x] 5.1 Luồng OAuth kết nối Ad Account Meta, lưu token mã hoá + `token_expires_at`; verify kết nối test hiển thị state `connected`
- [x] 5.2 Job làm mới token trước khi hết hạn; verify token gần hết hạn được refresh, token hỏng → `needs_reconnect` + dừng đồng bộ
- [x] 5.3 API gắn/gỡ AdsBinding (campaign/adset/ad); verify gỡ giữ lại AdsMetric lịch sử đánh dấu ngừng cập nhật
- [x] 5.4 Job đồng bộ Insights (mục 6.4), chu kỳ ≤ 6h khi active; verify ghi AdsMetric `source=synced` kèm `data_as_of`
- [x] 5.5 Tổng hợp số liệu khi nhiều AdsBinding (cộng spend/messages, tính lại CPP/ROAS/CTR có trọng số); verify unit test công thức
- [x] 5.6 Xử lý lỗi Ads API (retry lùi dần, giữ số liệu gần nhất, chỉ báo lỗi khi fail > 24h); verify test mô phỏng rate limit + lỗi mạng
- [x] 5.7 Phát hiện ad chuyển paused/completed → cập nhật trạng thái ads hạng mục + phát sự kiện "ads đã dừng"; verify test đổi delivery_status
- [x] 5.8 API nhập tay AdsMetric (`source=manual`) với nhãn phân biệt; verify test thứ tự ưu tiên hiển thị synced > manual
- [x] 5.9 Trường `evaluation` chỉ manager ghi; verify hiển thị ở cột bảng
- [x] 5.10 Ô "báo cáo hiệu quả ads" hiển thị số hiện tại + `data_as_of` + nguồn; verify render đúng khi có/không có dữ liệu

### 7.6 Google Sheets sync

- [x] 6.1 Luồng OAuth Google (refresh token của manager) + parse `spreadsheet_id`/`sheet_tab`; verify xác thực quyền đọc/ghi sheet
- [x] 6.2 Màn hình cấu hình `SheetSyncMapping` (header row, ánh xạ cột → field, `conflict_rule`); verify lưu + chạy đồng bộ lần đầu nạp dữ liệu
- [x] 6.3 Đồng bộ hệ thống → sheet theo ô có ánh xạ; verify đổi field trong hệ thống được ghi xuống sheet chu kỳ kế tiếp
- [x] 6.4 Đồng bộ sheet → hệ thống với delta theo snapshot; verify thêm dòng sheet tạo ContentItem mới, status không hợp lệ bị bỏ qua + đếm dòng lỗi
- [x] 6.5 Đẩy số liệu ads xuống sheet một chiều (không đọc ngược, mục 6.2); verify cột báo cáo ads trên sheet cập nhật, sửa tay trên sheet không ảnh hưởng hệ thống
- [x] 6.6 Phát hiện xung đột cùng field hai bên → áp `conflict_rule`, ghi `SyncConflict`; verify test kịch bản xung đột deadline
- [x] 6.7 Xoá dòng sheet → đánh dấu "mất liên kết", không xoá ContentItem, thông báo manager; verify test
- [x] 6.8 Job nền đồng bộ ≤ 5 phút/dự án running + nút "đồng bộ ngay" + màn hình trạng thái/nhật ký (`SyncRun`, `SyncConflict`); verify hiển thị thời điểm, kết quả, số dòng đọc/ghi
- [x] 6.9 Tắt đồng bộ ở cấp dự án dừng mọi job nền, giữ nguyên dữ liệu hai bên; verify test

### 7.7 Realtime & Notifications

- [x] 7.1 Kênh realtime theo "phòng" `project_id` (WebSocket/SSE) + fallback polling 10–15s; verify bảng nội dung cập nhật khi người khác đổi trạng thái, tự kết nối lại khi mất kết nối
- [x] 7.2 Notification engine sinh `Notification` theo bảng sự kiện → người nhận (mục 5.7 R1); verify test từng loại sự kiện ra đúng người, không tự thông báo cho người gây ra
- [x] 7.3 API đếm chưa đọc + danh sách gần nhất phục vụ polling 30s; verify badge số đúng
- [x] 7.4 UI chuông (badge, dropdown, mở → đánh dấu đã đọc + điều hướng đúng đối tượng, "đánh dấu tất cả đã đọc"); verify end-to-end
- [x] 7.5 `NotificationPreference` bật/tắt theo nhóm; verify tắt một nhóm thì ngừng sinh thông báo nhóm đó cho người đó
- [ ] 7.6 Đẩy cập nhật chỉ số dashboard qua kênh realtime; verify chỉ số đổi trong vài giây khi có thay đổi liên quan

### 7.8 Progress analytics

- [ ] 8.1 API dashboard tiến độ thời gian thực (tổng, đang sản xuất, chờ duyệt, quá hạn, đã lên ads, ads đang chạy) trong phạm vi dự án manager quản lý; verify số khớp dữ liệu mẫu
- [ ] 8.2 API "theo nhân sự" (đang thực hiện, hoàn tất trong kỳ, quá hạn, thời gian TB nhận→da_duyet tính từ StatusHistory); verify test công thức
- [ ] 8.3 API báo cáo tuần/tháng (throughput, tỷ lệ đúng hạn, số lần trả lại, tổng spend, tổng messages, ROAS TB có trọng số, top hạng mục theo ROAS); verify kỳ rỗng trả về 0 + nhãn "chưa có dữ liệu"
- [ ] 8.4 API so sánh kỳ với kỳ liền trước (chênh lệch tuyệt đối + %); verify test hai kỳ có dữ liệu
- [ ] 8.5 Xuất báo cáo và bảng "theo nhân sự" ra CSV/Excel; verify tệp tải về chứa đúng chỉ số đang xem
- [ ] 8.6 Màn hình dashboard (stat cards + bảng theo nhân sự) + màn hình báo cáo tuần/tháng có toggle so sánh; verify điều hướng từ nhân sự → danh sách hạng mục của họ
- [ ] 8.7 Giới hạn dashboard/báo cáo cấp dự án cho manager; staff chỉ thấy việc của mình; verify test phân quyền

### 7.9 Kiểm thử & xác minh tích hợp

- [ ] 9.1 Test phân quyền theo phạm vi dự án xuyên mọi tính năng (không thao tác/không xem xuyên dự án)
- [ ] 9.2 Test state machine sản xuất đầy đủ (mục 5.3) gồm hai bước duyệt và trả lại
- [ ] 9.3 Test đồng bộ 2 chiều Google Sheets: nạp lần đầu, sửa hai chiều, thêm/xoá dòng, xung đột, mất quyền
- [ ] 9.4 Test tích hợp Meta Ads API với mock: đồng bộ định kỳ, nhiều ad/hạng mục, rate limit, token hỏng, ads dừng
- [ ] 9.5 Test báo cáo tuần/tháng và so sánh kỳ trên bộ dữ liệu có StatusHistory + AdsMetric trải nhiều kỳ
- [ ] 9.6 Kiểm tra thủ công luồng chính end-to-end: tạo dự án → gắn sheet → nạp hạng mục → giao việc → viết/duyệt kịch bản → quay/duyệt video → gắn campaign → lên ads → số liệu về → đánh giá → xem dashboard và báo cáo tuần
- [ ] 9.7 Kiểm tra realtime: hai phiên trình duyệt cùng dự án thấy thay đổi của nhau trong vài giây; mất kết nối rồi khôi phục không để dữ liệu cũ âm thầm

---

## 8. Cần chốt trước / trong khi build (Open Questions)

Các câu này có thể trả lời sau mà không đổi cấu trúc, nhưng nên chốt sớm:

1. **Định nghĩa "Mess" và "CPP":** — **ĐÃ CHỐT (2026-08-28):** Mess =
   `messaging_conversation_started` với attribution mặc định của Meta (7-day
   click + 1-day view). CPP = **Cost Per Purchase** = `cost_per_action_type` cho
   `omni_purchase` (không phải cost per message) → field `cost_per_purchase`.
2. **Phạm vi @mention:** — **ĐÃ CHỐT:** chỉ thành viên dự án.
3. **Nhãn định dạng nội dung:** — **ĐÃ CHỐT:** có; field `content_format`, enum
   `reels | tvc | photo`.
4. **Múi giờ & mốc tuần:** báo cáo tính theo múi giờ nào, tuần bắt đầu thứ Hai hay
   Chủ nhật? *(chưa chốt — nhóm 7.8)*
5. **Dự án "Hoàn thành":** — **ĐÃ CHỐT (2026-08-28):** vẫn đồng bộ Ads nhưng giãn
   chu kỳ (~24 giờ) so với `running` (≤ 6 giờ); `archived` dừng hẳn.
