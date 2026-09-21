// Entrypoint riêng cho Vercel. Vercel tự nhận mọi file trong /api làm
// serverless function (zero-config) — KHÔNG được gọi app.listen() ở đây,
// Vercel tự bọc app Express thành handler xử lý từng request.
//
// Server "sống liên tục" thật (dùng cho Render/VPS...) vẫn nằm ở
// artifacts/api-server/src/index.ts, không đụng tới file này.
import app from "../artifacts/api-server/src/app";

export default app;
