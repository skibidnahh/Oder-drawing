import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
} from "@workspace/db";
import {
  orderImagesTable,
  orderNotesTable,
  ordersTable,
  packagesTable,
  usersTable,
} from "@workspace/db/schema";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { audit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();
const orderInputSchema = z.object({
  packageId: z.number().int().positive(),
  subject: z.string().trim().min(2).max(160),
  artType: z.string().trim().min(2).max(80),
  style: z.string().trim().min(2).max(80),
  size: z.string().trim().min(1).max(80),
  colors: z.string().trim().min(1).max(160),
  description: z.string().trim().min(2).max(3000),
  purpose: z.string().trim().max(80).optional(),
  addText: z.boolean().default(false),
  addedText: z.string().trim().max(300).optional(),
  imageKeys: z.array(z.string().regex(/^[a-f0-9-]{36}\/[a-zA-Z0-9._-]+$/)).max(5).default([]),
});
const statusSchema = z.object({ status: z.enum(["PENDING", "ACCEPTED", "DRAWING", "COMPLETED", "REJECTED"]) });
const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

async function buildOrder(order: typeof ordersTable.$inferSelect) {
  const [[pack], images, notes, [owner]] = await Promise.all([
    db.select().from(packagesTable).where(eq(packagesTable.id, order.packageId)).limit(1),
    db.select().from(orderImagesTable).where(eq(orderImagesTable.orderId, order.id)).orderBy(asc(orderImagesTable.id)),
    db.select().from(orderNotesTable).where(eq(orderNotesTable.orderId, order.id)).orderBy(asc(orderNotesTable.createdAt)),
    db.select({ fullName: usersTable.fullName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1),
  ]);
  return {
    ...order,
    package: pack ?? null,
    owner: owner ?? null,
    images: images.map((image) => ({ ...image, url: `/api/uploads/${order.userId}/${image.objectKey.split("/").pop()}` })),
    notes,
  };
}

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const orders = await db.select().from(ordersTable)
    .where(req.user?.role === "ADMIN" ? undefined : eq(ordersTable.userId, req.user!.id))
    .orderBy(desc(ordersTable.createdAt));
  res.json(await Promise.all(orders.map(buildOrder)));
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, String(req.params.id))).limit(1);
  if (!order || (req.user?.role !== "ADMIN" && order.userId !== req.user?.id)) {
    res.status(404).json({ error: "Không tìm thấy đơn hoặc bạn không có quyền xem." });
    return;
  }
  res.json(await buildOrder(order));
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  if (req.user?.status !== "APPROVED") {
    res.status(403).json({ error: "Tài khoản chưa được Admin duyệt nên chưa thể đặt tranh." });
    return;
  }
  const parsed = orderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.addText && !parsed.data.addedText) {
    res.status(400).json({ error: "Bạn đã chọn thêm chữ nhưng chưa nhập nội dung chữ." });
    return;
  }
  if (parsed.data.imageKeys.some((key) => !key.startsWith(`${req.user!.id}/`))) {
    res.status(400).json({ error: "Ảnh tham khảo không thuộc phiên tải lên của bạn." });
    return;
  }

  const order = await db.transaction(async (tx) => {
    const [pack] = await tx.select().from(packagesTable).where(eq(packagesTable.id, parsed.data.packageId)).limit(1);
    if (!pack || !pack.isOpen || pack.currentOrders >= pack.maximumOrders) {
      throw new Error("PACKAGE_CLOSED");
    }
    const [created] = await tx.insert(ordersTable).values({
      userId: req.user!.id,
      packageId: pack.id,
      subject: parsed.data.subject,
      artType: parsed.data.artType,
      style: parsed.data.style,
      size: parsed.data.size,
      colors: parsed.data.colors,
      description: parsed.data.description,
      purpose: parsed.data.purpose || null,
      addText: parsed.data.addText,
      addedText: parsed.data.addedText || null,
    }).returning();
    await tx.update(packagesTable).set({
      currentOrders: pack.currentOrders + 1,
      isOpen: pack.currentOrders + 1 < pack.maximumOrders,
      updatedAt: new Date(),
    }).where(eq(packagesTable.id, pack.id));
    if (parsed.data.imageKeys.length) {
      await tx.insert(orderImagesTable).values(parsed.data.imageKeys.map((objectKey) => ({
        orderId: created.id,
        objectKey,
        originalName: objectKey.split("/").pop() ?? "reference",
        contentType: "image/*",
        byteSize: 0,
      })));
    }
    return created;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "PACKAGE_CLOSED") return null;
    throw error;
  });

  if (!order) {
    res.status(409).json({ error: "Gói này đã đóng hoặc đã đủ số lượng." });
    return;
  }
  await audit(req.user!.id, "CREATE_ORDER", "order", order.id, { packageId: order.packageId });
  res.status(201).json(await buildOrder(order));
});

router.patch("/admin/orders/:id/status", requireAdmin, async (req, res): Promise<void> => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(ordersTable).set({
    status: parsed.data.status,
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, String(req.params.id))).returning();
  if (!updated) {
    res.status(404).json({ error: "Không tìm thấy đơn." });
    return;
  }
  await audit(req.user!.id, "UPDATE_ORDER_STATUS", "order", updated.id, { status: updated.status });
  res.json(await buildOrder(updated));
});

router.post("/admin/orders/:id/notes", requireAdmin, async (req, res): Promise<void> => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [order] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.id, String(req.params.id))).limit(1);
  if (!order) {
    res.status(404).json({ error: "Không tìm thấy đơn." });
    return;
  }
  const [note] = await db.insert(orderNotesTable).values({
    orderId: order.id,
    adminId: req.user!.id,
    body: parsed.data.body,
  }).returning();
  await audit(req.user!.id, "CREATE_ORDER_NOTE", "order", order.id);
  res.status(201).json(note);
});

export default router;