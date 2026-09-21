// Entrypoint riêng cho Vercel. Vercel tự nhận mọi file trong /api làm
// serverless function (zero-config) — KHÔNG được gọi app.listen() ở đây,
// Vercel tự bọc app Express thành handler xử lý từng request.
//
// Cố ý import bản JS ĐÃ BUILD SẴN (dist/app.mjs), không import thẳng file
// .ts nguồn — vì package api-server dùng TypeScript Project References
// (rootDir/references) chỉ tương thích với "tsc --build" ở gốc repo,
// không tương thích với cách Vercel tự biên dịch từng file lẻ.
// Dùng bản JS build sẵn né được toàn bộ vấn đề đó.
//
// Server "sống liên tục" thật (dùng cho Render/VPS...) vẫn nằm ở
// artifacts/api-server/src/index.ts, không đụng tới file này.
// @ts-ignore - dist/app.mjs chỉ tồn tại sau khi "pnpm run build" chạy xong
import app from "../artifacts/api-server/dist/app.mjs";

export default app;
