// Entrypoint cho Vercel — CỐ Ý dùng .mjs (JavaScript thuần), không phải .ts.
// Lý do: Vercel liên tục tự ý quét kiểm tra kiểu (tsc) xuyên suốt toàn bộ
// monorepo mỗi khi thấy có file .ts trong /api, dù file đó có thật sự
// import tới hay không — gây lỗi build không thể kiểm soát từ phía code.
// Dùng .mjs né hoàn toàn bước kiểm tra kiểu đó.
import app from “../artifacts/api-server/dist/app.mjs”;

export default app;
