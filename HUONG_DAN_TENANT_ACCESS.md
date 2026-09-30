# Khởi tạo quyền truy cập Flow API

## Tài khoản quản trị đầu tiên

Dashboard dùng phiên đăng nhập phía server. Trước lần đăng nhập đầu tiên, đặt secret một lần trên Cloudflare Worker:

```powershell
npx wrangler secret put DASHBOARD_BOOTSTRAP_TOKEN
```

Nhập một chuỗi ngẫu nhiên dài (ít nhất 32 byte) tại lời nhắc của Wrangler. Không lưu secret trong Git và không gửi secret qua chat. Sau đó mở `/login`, nhập secret này cùng tên đăng nhập hoặc email, tên hiển thị và mật khẩu quản trị (tối thiểu 12 ký tự). Chỉ có thể tạo một tài khoản quản trị đầu tiên; sau khi tạo xong, endpoint bootstrap sẽ đóng.

## Tenant dữ liệu

- Dữ liệu đã có được gán `tenant_id = 1` khi Worker khởi tạo schema mới.
- Tài khoản quản trị đầu tiên thuộc tenant 1 và xem được toàn bộ dữ liệu để quản trị.
- Khi cần thêm đối tác, quản trị viên tạo tài khoản trong mục quản lý người dùng. Mỗi đối tác được cấp tenant riêng và chỉ đọc dữ liệu thuộc tenant của mình.
- Mật khẩu ban đầu của đối tác tối thiểu 12 ký tự; gửi mật khẩu cho đối tác qua kênh riêng.

Sau khi đã tạo tài khoản quản trị, có thể xóa secret bootstrap bằng `npx wrangler secret delete DASHBOARD_BOOTSTRAP_TOKEN`; đăng nhập hiện hữu không phụ thuộc secret này.
