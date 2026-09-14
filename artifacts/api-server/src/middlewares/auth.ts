import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { sessionsTable, usersTable } from "@workspace/db/schema";

declare global {
  namespace Express {
    interface Request {
      user?: typeof usersTable.$inferSelect;
    }
  }
}

export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sessionId = req.signedCookies?.usagi_session;
  if (!sessionId) {
    next();
    return;
  }

  const [session] = await db
    .select({ user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(eq(sessionsTable.id, sessionId), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);

  if (session) req.user = session.user;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Bạn cần đăng nhập." });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Bạn không có quyền truy cập khu vực này." });
    return;
  }
  next();
}