import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadUser } from "./middlewares/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(cors({ origin: process.env.APP_ORIGIN ?? false, credentials: true }));
const cookieSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && !cookieSecret) {
  throw new Error("SESSION_SECRET must be set in production.");
}
app.use(cookieParser(cookieSecret || "development-only-cookie-secret"));
app.use("/api/uploads", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "4mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(loadUser);

app.use("/api", router);

export default app;
