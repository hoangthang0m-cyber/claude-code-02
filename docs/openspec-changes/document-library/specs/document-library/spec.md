## Purpose

Cung cấp trang "Tài liệu" với hai kho link — biên bản họp và tài liệu tổ chức — để phòng lưu trữ tập trung; hệ thống chỉ lưu và mở link, không đọc nội dung và không đồng bộ.

## ADDED Requirements

### Requirement: Kho biên bản họp

Hệ thống SHALL cung cấp một kho "Biên bản họp" cho phép thành viên thêm nhiều mục, mỗi mục gồm: tiêu đề (bắt buộc), link (bắt buộc — Google Sheets, Docs, Drive, hoặc URL bất kỳ), ngày họp (tuỳ chọn), và ghi chú ngắn (tuỳ chọn). Mục này SHALL KHÔNG gắn với tính năng "Cuộc họp"; hệ thống SHALL KHÔNG đọc hay đồng bộ nội dung link.

#### Scenario: Thêm một biên bản họp

- **WHEN** thành viên nhập tiêu đề "Họp kế hoạch tháng 9", dán link Google Docs, chọn ngày họp và lưu
- **THEN** hệ thống lưu mục đó kèm người thêm và thời điểm, hiển thị trong kho biên bản họp

#### Scenario: Thiếu tiêu đề hoặc link

- **WHEN** thành viên lưu một mục mà thiếu tiêu đề hoặc thiếu link
- **THEN** hệ thống từ chối lưu và chỉ rõ trường còn thiếu

#### Scenario: Mở biên bản

- **WHEN** thành viên bấm vào một biên bản họp
- **THEN** hệ thống mở link trong tab mới, không nhúng và không xử lý nội dung

### Requirement: Kho tài liệu tổ chức khác

Hệ thống SHALL cung cấp một kho "Tài liệu tổ chức" cho phép thành viên thêm nhiều mục, mỗi mục gồm: tiêu đề (bắt buộc), link ngoài (bắt buộc), ngày tài liệu (tuỳ chọn), và ghi chú ngắn (tuỳ chọn). Hệ thống SHALL KHÔNG đọc hay đồng bộ nội dung link.

#### Scenario: Thêm một tài liệu tổ chức

- **WHEN** thành viên nhập tiêu đề "Quy chế lương thưởng video", dán link và lưu
- **THEN** hệ thống lưu mục đó vào kho tài liệu tổ chức

#### Scenario: Hai kho tách biệt

- **WHEN** thành viên xem trang Tài liệu
- **THEN** hệ thống hiển thị hai phần riêng: "Biên bản họp" và "Tài liệu tổ chức"; mục thêm ở kho nào chỉ hiện ở kho đó

### Requirement: Sửa và xoá bởi mọi thành viên

Hệ thống SHALL cho phép **mọi thành viên** sửa (tiêu đề, link, ngày, ghi chú) và xoá bất kỳ mục nào trong cả hai kho.

#### Scenario: Sửa một mục

- **WHEN** một thành viên đổi tiêu đề hoặc link của một mục
- **THEN** hệ thống lưu thay đổi kèm người sửa và thời điểm

#### Scenario: Xoá một mục

- **WHEN** một thành viên xoá một mục
- **THEN** hệ thống gỡ mục đó khỏi kho; các mục khác giữ nguyên

#### Scenario: Người chưa đăng nhập

- **WHEN** một người chưa đăng nhập cố mở trang Tài liệu
- **THEN** hệ thống yêu cầu đăng nhập

### Requirement: Tìm và sắp xếp

Hệ thống SHALL cho phép tìm mục theo tiêu đề (khớp một phần) và sắp xếp danh sách trong mỗi kho theo ngày hoặc theo lần cập nhật gần nhất.

#### Scenario: Tìm theo tiêu đề

- **WHEN** thành viên gõ "tháng 9" vào ô tìm của kho biên bản họp
- **THEN** hệ thống chỉ hiển thị các biên bản có tiêu đề chứa "tháng 9"

#### Scenario: Sắp xếp theo ngày

- **WHEN** thành viên chọn sắp xếp theo ngày giảm dần
- **THEN** hệ thống hiển thị các mục mới nhất trước; mục không có ngày xếp cuối

### Requirement: Không đọc nội dung, không đồng bộ

Hệ thống SHALL KHÔNG đọc dữ liệu từ link, ghi dữ liệu ra link, hay chạy job nền theo dõi link. Việc kiểm tra định dạng URL hợp lệ là tuỳ chọn và chỉ chạy khi người dùng thêm/sửa link.

#### Scenario: Nội dung sheet/doc thay đổi

- **WHEN** ai đó sửa nội dung trong một Google Sheets/Docs đã đính vào kho
- **THEN** dữ liệu trên hệ thống không thay đổi và không có thông báo nào được sinh ra
