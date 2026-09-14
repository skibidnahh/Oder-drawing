# Usagi Art Order

Website đặt tranh tiếng Việt, giao diện React/Vite và API Express. Dữ liệu nghiệp vụ được lưu trong PostgreSQL tương thích Neon; đăng nhập dùng session cookie HttpOnly; ảnh tham khảo được kiểm tra quyền theo tài khoản; mutation quản trị được ghi audit log.

## Chạy local

1. Tạo PostgreSQL database (Neon hoặc Postgres riêng).
2. Copy `.env.example` thành `.env` và điền `DATABASE_URL`, `SESSION_SECRET`.
3. Cài dependencies bằng `pnpm install`.
4. Tạo bảng:

   ```bash
   pnpm --filter @workspace/db run push
   ```

5. Chạy các workflow frontend và API:

   ```bash
   pnpm --filter @workspace/api-server run dev
   pnpm --filter @workspace/usagi-art-order run dev
   ```

Frontend gọi API bằng đường dẫn tương đối `/api`, vì vậy có thể chạy sau reverse proxy cùng domain hoặc cấu hình `APP_ORIGIN` cho frontend/API khác domain.

## Tạo Admin đầu tiên

Đăng ký tài khoản bình thường, sau đó cấp role bằng SQL một lần:

```sql
UPDATE usagi_users
SET role = 'ADMIN', status = 'APPROVED'
WHERE email = 'admin@example.com';
```

Không có mật khẩu Admin hardcode trong frontend. Mật khẩu được băm bằng `scrypt`; session ID chỉ nằm trong cookie HttpOnly.

## Upload ảnh

Bản Node truyền thống lưu ảnh trong `UPLOAD_DIR` và kiểm tra:

- JPG, PNG, WebP
- tối đa 5MB/ảnh
- chỉ chủ ảnh hoặc Admin được xem/xóa
- object key phải gắn với user ID trước khi tạo đơn

`uploads/` không nên dùng trên filesystem tạm thời của serverless. Khi deploy lên Vercel hoặc nền tảng không có disk bền vững, thay adapter trong `artifacts/api-server/src/routes/uploads.ts` bằng S3-compatible storage (R2, S3, MinIO hoặc dịch vụ tương đương) và giữ nguyên API JSON hiện tại.

## Import hợp lệ

Admin có thể dùng `POST /api/admin/import/users` hoặc giao diện Admin. Payload là JSON array gồm `fullName`, `email`, `temporaryPassword`, tùy chọn `className`, `contact`. Email được chuẩn hóa, bản ghi trùng được bỏ qua, mật khẩu vẫn được băm và mỗi bản ghi được ghi audit log.

## Deploy / GitHub

- Commit source, `.env.example`, lockfile và README.
- Không commit `.env`, `SESSION_SECRET`, `DATABASE_URL` hoặc thư mục `uploads`.
- Cấu hình build frontend bằng package `@workspace/usagi-art-order` và chạy API bằng `@workspace/api-server`.
- Với nền tảng Node truyền thống, chạy migration/schema push trước khi mở traffic.
- Dùng HTTPS để cookie production có cờ `Secure`.# Fixed lock files
