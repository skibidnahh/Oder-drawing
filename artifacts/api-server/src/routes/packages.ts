import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { packagesTable } from "@workspace/db/schema";
import { requireAdmin } from "../middlewares/auth";
import { audit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();
const defaultPackages = [
  { name: "5K", price: 5000, maximumOrders: 10 },
  { name: "10K", price: 10000, maximumOrders: 10 },
  { name: "15K", price: 15000, maximumOrders: 8 },
  { name: "25K", price: 25000, maximumOrders: 5 },
];

async function ensurePackages() {
  const existing = await db.select().from(packagesTable);
  if (existing.length) return existing;
  await db.insert(packagesTable).values(defaultPackages);
  return db.select().from(packagesTable).orderBy(asc(packagesTable.id));
}

router.get("/packages", async (_req, res): Promise<void> => {
  const packages = await ensurePackages();
  res.json(packages);
});

router.patch("/admin/packages/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({
    price: z.number().int().min(0).optional(),
    maximumOrders: z.number().int().min(1).optional(),
    isOpen: z.boolean().optional(),
  }).safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Thông tin gói không hợp lệ." });
    return;
  }
  const [updated] = await db.update(packagesTable).set({
    ...parsed.data,
    updatedAt: new Date(),
  }).where(eq(packagesTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Không tìm thấy gói." });
    return;
  }
  await audit(req.user?.id ?? null, "UPDATE_PACKAGE", "package", String(id), parsed.data);
  res.json(updated);
});

export { ensurePackages };
export default router;