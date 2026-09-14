import { Router, type IRouter, type Request, type Response } from "express";
import { eq, lt } from "drizzle-orm";
import { db } from "@workspace/db";
import { sessionsTable, usersTable } from "@workspace/db/schema";
import { loadUser, requireAuth } from "../middlewares/auth";
import { hashPassword, newSessionId, safeEmail, verifyPassword } from "../lib/security";
import { audit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();
const sessionDays = 30;
const attempts = new Map<string, { count: number; resetAt: number }>();

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  className: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(160).optional(),
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
  passwordConfirm: z.string().min(8).max(200),
});

const credentialsSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

function publicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    className: user.className,
    contact: user.contact,
    role: user.role,
    status: user.status,
    adminNote: user.adminNote,
    createdAt: user.createdAt,
  };
}

async function setSession(res: Response, userId: string): Promise<string> {
  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ id: sessionId, userId, expiresAt });
  res.cookie("usagi_session", sessionId, {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return sessionId;
}

function rateLimitKey(req: Request): string {
  return String(req.ip ?? req.socket.remoteAddress ?? "unknown");
}

function allowAttempt(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.password !== parsed.data.passwordConfirm) {
    res.status(400).json({ error: "Thông tin đăng ký chưa hợp lệ hoặc mật khẩu không khớp." });
    return;
  }

  const email = safeEmail(parsed.data.email);
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Email này đã được đăng ký." });
    return;
  }

  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash: await hashPassword(parsed.data.password),
    fullName: parsed.data.fullName,
    className: parsed.data.className || null,
    contact: parsed.data.contact || null,
  }).returning();

  await audit(user.id, "REGISTER", "user", user.id);
  res.status(201).json({ user: publicUser(user), message: "Tài khoản đã được gửi để Admin duyệt." });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = credentialsSchema.safeParse(req.body);
  const key = rateLimitKey(req);
  if (!allowAttempt(key)) {
    res.status(429).json({ error: "Bạn thử đăng nhập quá nhiều lần. Hãy thử lại sau." });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "Email hoặc mật khẩu không hợp lệ." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, safeEmail(parsed.data.email))).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
    return;
  }

  await setSession(res, user.id);
  await audit(user.id, "LOGIN", "user", user.id);
  res.json({ user: publicUser(user) });
});

router.post("/auth/logout", loadUser, async (req, res): Promise<void> => {
  const sessionId = req.signedCookies?.usagi_session;
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
  res.clearCookie("usagi_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  if (req.user) await audit(req.user.id, "LOGOUT", "user", req.user.id);
  res.status(204).send();
});

router.get("/auth/me", loadUser, (req, res): void => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

router.get("/auth/sessions/cleanup", requireAuth, async (_req, res): Promise<void> => {
  await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
  res.status(204).send();
});

export default router;