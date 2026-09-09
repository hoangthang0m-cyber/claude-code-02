# Hẻm Tarot — Content Performance Tracker

Ứng dụng quản lý và đo hiệu quả nội dung của đội Hẻm Tarot.

## 🔗 Link chính của web

```
https://claude-code-02-thang20.vercel.app
```

**Đây là link duy nhất nên dùng và nên chia sẻ.** Nó luôn trỏ tới bản mới nhất
đã được đưa lên nhánh `main`.

## Ba loại link Vercel — đừng nhầm

Vercel sinh ra nhiều link cho cùng một dự án. Chúng khác nhau, và nhầm lẫn giữa
chúng đã từng gây hiểu lầm là "code chưa được cập nhật":

| Loại | Ví dụ | Ý nghĩa |
|---|---|---|
| **Domain production** | `claude-code-02-thang20.vercel.app` | ✅ **Dùng cái này.** Luôn trỏ tới bản `main` mới nhất. |
| Alias theo nhánh | `claude-code-02-git-main-thang20.vercel.app` | Trỏ tới bản mới nhất của nhánh `main`. Dùng được nhưng không phải link chuẩn. |
| Link của từng lần deploy | `claude-code-02-<mã ngẫu nhiên>-thang20.vercel.app` | ⚠️ **Đóng băng vĩnh viễn** ở đúng commit lúc build. Không bao giờ thay đổi, kể cả khi đã sửa hoặc hoàn nguyên code. Chỉ dùng để xem lại lịch sử. |

Mỗi lần build, Vercel tạo thêm một link loại thứ ba. Trong bảng Deployments,
card nào có nhãn **Stale** nghĩa là bản đó đã cũ — đã có bản mới hơn thay thế.
Card của bản đang chạy thật sẽ có nhãn **Current**.

Nếu mở link chính mà vẫn thấy giao diện cũ, hãy tải lại bỏ cache
(`Ctrl + Shift + R`) hoặc mở cửa sổ ẩn danh — CSS và font của Next.js được lưu
cache rất lâu trong trình duyệt.

## Kho mã

- GitHub: <https://github.com/hoangthang0m-cyber/claude-code-02>
- Nhánh mặc định: `main` — đẩy lên `main` là Vercel tự deploy lên link chính.

## Tài liệu

| File | Nội dung |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | Đặc tả gốc, nguồn sự thật duy nhất của sản phẩm |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Mô hình dữ liệu Firestore |
| [`docs/SETUP.md`](docs/SETUP.md) | Cài đặt môi trường phát triển |
| [`docs/ENV.md`](docs/ENV.md) | Biến môi trường và cấu hình OAuth |
| `docs/E2E-*.md` | Kịch bản kiểm thử thủ công từng tính năng |

## Lệnh thường dùng

```bash
npm run dev              # chạy máy chủ phát triển
npm run build            # build production
npm start                # chạy bản đã build
npx vitest run           # chạy toàn bộ test
npx tsc --noEmit         # kiểm tra kiểu
npx eslint src           # kiểm tra lint
npm run rules:deploy     # đẩy firestore.rules lên Firebase
npm run indexes:deploy   # đẩy firestore.indexes.json lên Firebase
```

## Công nghệ

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
Firebase / Firestore · Vercel
