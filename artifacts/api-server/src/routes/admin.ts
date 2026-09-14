import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogsTable, usersTable } from "@workspace/db/schema";
import { requireAdmin } from "../middlewares/auth";
import { audit } from "../lib/audit";
import { hashImport, hashPassword, safeEmail } from "../lib/security";
import { z } from "zod";

const router: IRouter = Router();
const decisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PENDING"]),
  adminNote: z.string().trim().max(1000).optional(),
});
const importSchema = z.object({
  rows: z.array(z.object({
    email: z.string().email(),
    fullName: z.string().trim().min(2).max(120),
    className: z.string().trim().max(80).optional(),
    contact: z.string().trim().max(160).optional(),
    temporaryPassword: z.string().min(8).max(200),
  })).min(1).max(200),
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

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const users = await db.select().from(usersTable)
    .where(status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? eq(usersTable.status, status) : undefined)
    .orderBy(desc(usersTable.createdAt));
  res.json(users.map(publicUser));
});

router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(usersTable).set({
    status: parsed.data.status,
    adminNote: parsed.data.adminNote || null,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, String(req.params.id))).returning();
  if (!updated) {
    res.status(404).json({ error: "Không tìm thấy tài khoản." });
    return;
  }
  await audit(req.user!.id, "UPDATE_ACCOUNT_STATUS", "user", updated.id, {
    status: updated.status,
    noteLength: parsed.data.adminNote?.length ?? 0,
  });
  res.json(publicUser(updated));
});

router.get("/admin/audit", requireAdmin, async (_req, res): Promise<void> => {
  const logs = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(200);
  res.json(logs);
});

router.post("/admin/import/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const results: Array<{ email: string; status: "created" | "skipped"; reason?: string }> = [];
  for (const row of parsed.data.rows) {
    const email = safeEmail(row.email);
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) {
      results.push({ email, status: "skipped", reason: "already_exists" });
      continue;
    }
    const [created] = await db.insert(usersTable).values({
      email,
      passwordHash: await hashPassword(row.temporaryPassword),
      fullName: row.fullName,
      className: row.className || null,
      contact: row.contact || null,
      status: "PENDING",
    }).returning();
    results.push({ email, status: "created" });
    await audit(req.user!.id, "IMPORT_USER", "user", created.id, { sourceHash: hashImport(JSON.stringify(row)) });
  }
  res.status(201).json({ results });
});

export default router;