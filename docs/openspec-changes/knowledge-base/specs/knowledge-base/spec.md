## Purpose

Cung cấp kho "Tri thức" cấp doanh nghiệp: nơi tập trung các đúc kết và công thức
vận hành marketing để dùng lại bền vững và để nhân sự mới học nhanh. Mỗi tri thức
gồm năm đầu mục cố định, đính được link tài liệu ngoài theo từng đầu mục, và tham
chiếu tới Dự án/Nhóm dự án đã có. Hệ thống chỉ lưu và mở link — không đọc nội
dung, không đồng bộ.

## ADDED Requirements

### Requirement: Trang "Tri thức" và danh sách tri thức

System SHALL cung cấp một trang "Tri thức" truy cập được từ thanh điều hướng
chính, hiển thị cho mọi người dùng đã đăng nhập danh sách các tri thức chưa lưu
trữ. Danh sách SHALL cho tìm theo tên và cho bật xem cả các tri thức đã lưu trữ.

#### Scenario: Mở trang Tri thức

- **WHEN** một thành viên đã đăng nhập bấm mục "Tri thức" trên thanh điều hướng
- **THEN** hệ thống hiển thị danh sách các tri thức đang hoạt động, mỗi mục gồm
  tên, trích đoạn mô tả tổng quan, và thời điểm cập nhật gần nhất
- **AND** mỗi mục mở được sang trang chi tiết của tri thức đó

#### Scenario: Tìm theo tên

- **WHEN** thành viên gõ một phần tên vào ô tìm kiếm
- **THEN** danh sách chỉ còn các tri thức có tên khớp

#### Scenario: Xem tri thức đã lưu trữ

- **WHEN** thành viên bật bộ lọc "đã lưu trữ"
- **THEN** danh sách hiển thị thêm các tri thức đã lưu trữ, có nhãn phân biệt

#### Scenario: Chưa có tri thức nào

- **WHEN** chưa có tri thức nào được tạo
- **THEN** trang hiển thị hướng dẫn tạo tri thức đầu tiên thay cho danh sách rỗng

### Requirement: Cấu trúc năm đầu mục của một tri thức

Một tri thức SHALL gồm đúng năm đầu mục theo thứ tự: (1) Tên, (2) Mô tả tổng
quan, (3) Mô tả chi tiết, (4) Quá trình đúc kết, (5) Đúc kết. Tên và Mô tả tổng
quan là bắt buộc; ba đầu mục còn lại là văn bản tự do tuỳ chọn. Trang chi tiết
SHALL hiển thị đủ năm đầu mục theo đúng thứ tự này.

#### Scenario: Xem trang chi tiết một tri thức

- **WHEN** thành viên mở một tri thức từ danh sách
- **THEN** hệ thống hiển thị lần lượt: Tên, Mô tả tổng quan, Mô tả chi tiết, Quá
  trình đúc kết, Đúc kết
- **AND** đầu mục 3, 4, 5 mỗi cái có khu vực đính link riêng; đầu mục 4 có thêm
  khu vực tham chiếu Dự án/Nhóm dự án

#### Scenario: Đầu mục văn bản để trống

- **WHEN** một tri thức chưa nhập "Quá trình đúc kết"
- **THEN** trang chi tiết vẫn hiển thị tiêu đề đầu mục đó kèm trạng thái trống,
  không báo lỗi

### Requirement: Tạo tri thức mới

System SHALL cho mọi thành viên đã đăng nhập tạo một tri thức mới, yêu cầu tối
thiểu Tên và Mô tả tổng quan. Nếu thiếu một trong hai, hệ thống SHALL từ chối và
chỉ rõ trường còn thiếu. Tri thức vừa tạo SHALL ở trạng thái hoạt động và ghi
nhận người tạo cùng thời điểm.

#### Scenario: Tạo tri thức hợp lệ

- **WHEN** thành viên nhập Tên và Mô tả tổng quan rồi xác nhận tạo
- **THEN** hệ thống lưu tri thức mới ở trạng thái hoạt động và mở trang chi tiết
  của nó

#### Scenario: Thiếu trường bắt buộc

- **WHEN** thành viên xác nhận tạo mà bỏ trống Tên hoặc Mô tả tổng quan
- **THEN** hệ thống từ chối và nêu rõ trường còn thiếu

#### Scenario: Nhân sự tạo được tri thức

- **WHEN** một người dùng có `system_role = staff` tạo một tri thức hợp lệ
- **THEN** hệ thống cho phép và lưu bình thường

### Requirement: Sửa nội dung tri thức

System SHALL cho mọi thành viên đã đăng nhập sửa Tên, Mô tả tổng quan và ba đầu
mục văn bản của một tri thức đang hoạt động, lưu kèm người sửa và thời điểm. Tên
và Mô tả tổng quan không được để trống khi sửa. Một tri thức đã lưu trữ SHALL ở
chế độ chỉ đọc: mọi yêu cầu sửa nội dung, đính link, hay gắn tham chiếu vào nó
SHALL bị từ chối.

#### Scenario: Sửa mô tả tổng quan

- **WHEN** thành viên đổi nội dung Mô tả tổng quan của một tri thức đang hoạt
  động và lưu
- **THEN** hệ thống lưu nội dung mới và cập nhật thời điểm "cập nhật gần nhất"
  cùng người sửa

#### Scenario: Xoá trắng trường bắt buộc khi sửa

- **WHEN** thành viên lưu bản sửa với Tên để trống
- **THEN** hệ thống từ chối

#### Scenario: Sửa một tri thức đã lưu trữ

- **WHEN** thành viên cố sửa nội dung, đính link, hoặc gắn tham chiếu vào một tri
  thức đã lưu trữ
- **THEN** hệ thống từ chối với thông báo tri thức đang ở chế độ chỉ đọc

#### Scenario: Nhân sự sửa được tri thức

- **WHEN** một người dùng `system_role = staff` sửa một tri thức đang hoạt động
- **THEN** hệ thống cho phép

### Requirement: Đính link tài liệu ngoài vào một đầu mục

System SHALL cho thành viên đính nhiều link vào từng đầu mục "Mô tả chi tiết",
"Quá trình đúc kết", và "Đúc kết". Mỗi link SHALL gồm URL (bắt buộc, bắt đầu bằng
`http://` hoặc `https://`) và nhãn (bắt buộc), cùng một ghi chú ngắn tuỳ chọn.
System SHALL KHÔNG đọc, tải, hay đồng bộ nội dung của link, và SHALL mở link
trong tab mới. System SHALL hiển thị cảnh báo khi số link của một đầu mục vượt
20, nhưng SHALL KHÔNG chặn thêm link.

#### Scenario: Thêm link tài liệu cho một đầu mục

- **WHEN** thành viên dán một URL Google Sheets và nhập nhãn "Bảng số liệu gốc"
  vào đầu mục "Mô tả chi tiết"
- **THEN** hệ thống lưu link kèm nhãn, người thêm, thời điểm, và hiển thị dạng
  liên kết bấm được trong đúng đầu mục đó

#### Scenario: Link thiếu nhãn

- **WHEN** thành viên thêm link mà không nhập nhãn
- **THEN** hệ thống từ chối và yêu cầu nhập nhãn

#### Scenario: URL không hợp lệ

- **WHEN** thành viên nhập một chuỗi không bắt đầu bằng `http://` hoặc `https://`
- **THEN** hệ thống từ chối với thông báo về định dạng URL

#### Scenario: Mở link

- **WHEN** người dùng bấm vào một link đã đính
- **THEN** hệ thống mở URL đó trong tab mới, không nhúng và không xử lý nội dung

#### Scenario: Link Sheets không sinh dữ liệu trong hệ thống

- **WHEN** một link Google Sheets được đính vào một đầu mục và Sheets đó chứa
  nhiều dòng dữ liệu
- **THEN** hệ thống không tạo hay cập nhật bất kỳ bản ghi nào từ nội dung đó

#### Scenario: Vượt ngưỡng cảnh báo

- **WHEN** một đầu mục đã có 21 link
- **THEN** khu vực link của đầu mục đó hiển thị cảnh báo nên gộp/dọn bớt, và vẫn
  cho thêm link mới

### Requirement: Sửa, gỡ, và sắp thứ tự link

System SHALL cho mọi thành viên đã đăng nhập sửa (URL, nhãn, ghi chú), gỡ, và sắp
lại thứ tự các link trong một đầu mục. Gỡ một link SHALL KHÔNG ảnh hưởng nội dung
tri thức hay các link còn lại.

#### Scenario: Sửa nhãn link

- **WHEN** thành viên đổi nhãn một link từ "Timeline" thành "Timeline Q3"
- **THEN** hệ thống lưu nhãn mới

#### Scenario: Nhân sự gỡ link

- **WHEN** một người dùng `system_role = staff` gỡ một link khỏi một đầu mục
- **THEN** hệ thống cho phép; các link còn lại và nội dung tri thức giữ nguyên

#### Scenario: Sắp thứ tự link

- **WHEN** thành viên kéo/đổi thứ tự các link trong một đầu mục
- **THEN** thứ tự mới được lưu và giữ nguyên khi tải lại trang

### Requirement: Tham chiếu Dự án và Nhóm dự án ở đầu mục "Quá trình đúc kết"

Ở đầu mục "Quá trình đúc kết", system SHALL cho thành viên gắn một hoặc nhiều
tham chiếu tới **Dự án** hoặc **Nhóm dự án** đã tồn tại (tạo ở trang Chiến dịch).
Mỗi tham chiếu SHALL lưu loại (Dự án hoặc Nhóm dự án), định danh của mục được
tham chiếu, và ảnh chụp tên của mục đó tại thời điểm gắn. Bấm vào một tham chiếu
SHALL mở trang của Dự án/Nhóm dự án tương ứng. System SHALL KHÔNG kéo số liệu và
SHALL KHÔNG đồng bộ lại tên khi tên gốc đổi về sau.

#### Scenario: Gắn tham chiếu Dự án và Nhóm dự án

- **WHEN** thành viên chọn một Dự án và một Nhóm dự án từ danh sách có sẵn để gắn
  vào "Quá trình đúc kết"
- **THEN** đầu mục đó hiển thị hai thẻ tham chiếu, mỗi thẻ ghi tên và loại

#### Scenario: Tham chiếu tới mục không tồn tại

- **WHEN** yêu cầu gắn tham chiếu mang định danh không ứng với Dự án hay Nhóm dự
  án nào
- **THEN** hệ thống từ chối

#### Scenario: Mở tham chiếu

- **WHEN** người dùng bấm vào một thẻ tham chiếu Dự án
- **THEN** hệ thống mở trang chi tiết của Dự án đó

#### Scenario: Tên gốc đổi sau khi gắn

- **WHEN** một Dự án được đổi tên sau khi đã được tham chiếu trong một tri thức
- **THEN** thẻ tham chiếu vẫn hiển thị tên đã chụp lúc gắn, và tri thức không sinh
  thông báo nào

#### Scenario: Gỡ tham chiếu

- **WHEN** thành viên gỡ một thẻ tham chiếu khỏi "Quá trình đúc kết"
- **THEN** hệ thống gỡ thẻ đó; Dự án/Nhóm dự án được tham chiếu không bị ảnh hưởng

#### Scenario: Nhân sự gắn và gỡ tham chiếu

- **WHEN** một người dùng `system_role = staff` gắn rồi gỡ một tham chiếu
- **THEN** hệ thống cho phép cả hai thao tác

### Requirement: Xoá một tri thức

System SHALL chỉ cho người dùng có `system_role = manager` xoá một tri thức, và
chỉ khi họ nhập lại đúng tên tri thức để xác nhận. Xoá một tri thức SHALL gỡ luôn
mọi link và mọi tham chiếu Dự án/Nhóm dự án thuộc tri thức đó. Yêu cầu xoá từ một
người dùng `system_role = staff` SHALL bị từ chối.

#### Scenario: Trưởng phòng xoá tri thức

- **WHEN** một Trưởng phòng xoá một tri thức và nhập lại đúng tên của nó
- **THEN** tri thức đó cùng toàn bộ link và tham chiếu của nó bị xoá khỏi hệ thống

#### Scenario: Xác nhận sai tên

- **WHEN** Trưởng phòng xác nhận xoá nhưng nhập tên không khớp
- **THEN** hệ thống từ chối và không xoá gì

#### Scenario: Nhân sự yêu cầu xoá

- **WHEN** một người dùng `system_role = staff` gọi thao tác xoá một tri thức
- **THEN** hệ thống từ chối với lỗi không đủ quyền

### Requirement: Lưu trữ và bỏ lưu trữ một tri thức

System SHALL chỉ cho người dùng `system_role = manager` lưu trữ hoặc bỏ lưu trữ
một tri thức. Một tri thức đã lưu trữ SHALL bị ẩn khỏi danh sách mặc định (chỉ
hiện khi bật bộ lọc "đã lưu trữ") và chuyển sang chỉ đọc; toàn bộ dữ liệu, link
và tham chiếu được giữ nguyên. Bỏ lưu trữ SHALL đưa tri thức trở lại trạng thái
hoạt động và cho sửa lại.

#### Scenario: Trưởng phòng lưu trữ một tri thức

- **WHEN** một Trưởng phòng lưu trữ một tri thức
- **THEN** tri thức đó biến khỏi danh sách mặc định, xuất hiện khi bật bộ lọc "đã
  lưu trữ", và trang chi tiết không còn nút sửa/thêm link/gắn tham chiếu

#### Scenario: Nhân sự yêu cầu lưu trữ

- **WHEN** một người dùng `system_role = staff` gọi thao tác lưu trữ
- **THEN** hệ thống từ chối với lỗi không đủ quyền

#### Scenario: Bỏ lưu trữ

- **WHEN** Trưởng phòng bỏ lưu trữ một tri thức
- **THEN** tri thức trở lại danh sách mặc định và sửa lại được

### Requirement: Không đồng bộ, không đọc nội dung

System SHALL KHÔNG có bất kỳ cơ chế nào đọc dữ liệu từ link hoặc tham chiếu đã
đính vào hệ thống, ghi dữ liệu hệ thống ra ngoài, hay chạy job nền theo dõi
link/tham chiếu. Việc kiểm tra URL chỉ giới hạn ở định dạng và chỉ chạy tại thời
điểm người dùng thêm hoặc sửa link.

#### Scenario: Nội dung tài liệu ngoài thay đổi

- **WHEN** ai đó sửa nội dung một Google Sheets đã được đính vào một tri thức
- **THEN** dữ liệu tri thức trên hệ thống không thay đổi và không có thông báo nào
  được sinh ra

#### Scenario: Không có job nền theo dõi link

- **WHEN** hệ thống chạy các tác vụ nền định kỳ
- **THEN** không tác vụ nào truy cập hay kiểm tra các link/tham chiếu của tri thức
