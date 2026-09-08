# Agent Rules & Workflow

## Deployment & Git Policy
- **Tự động Push Git & Deploy**: Mỗi lần hoàn thành nhiệm vụ hoặc chỉnh sửa code theo yêu cầu của người dùng, luôn luôn:
  1. Chạy `git add .` và `git commit -m "..."` với nội dung mô tả rõ thay đổi.
  2. Chạy `git push` lên repository.
  3. Chạy lệnh deploy: `npm run deploy` (Cloudflare Workers / Assets via Wrangler) để cập nhật trực tiếp phiên bản mới nhất.
