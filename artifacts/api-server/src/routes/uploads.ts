import { Router, type IRouter } from "express";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../middlewares/auth";
import { audit } from "../lib/audit";

const router: IRouter = Router();
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || "uploads");

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

router.post("/uploads", requireAuth, async (req, res): Promise<void> => {
  const contentType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
  if (!allowedTypes.has(contentType)) {
    res.status(415).json({ error: "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP." });
    return;
  }
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
  if (!body.length || body.length > maxBytes) {
    res.status(413).json({ error: "Ảnh phải lớn hơn 0 và không quá 5MB." });
    return;
  }
  const ownerDir = path.join(uploadRoot, req.user!.id);
  await mkdir(ownerDir, { recursive: true });
  const fileName = `${randomUUID()}.${extensionFor(contentType)}`;
  const objectKey = `${req.user!.id}/${fileName}`;
  await writeFile(path.join(ownerDir, fileName), body, { flag: "wx" });
  await audit(req.user!.id, "UPLOAD_REFERENCE", "file", objectKey, { contentType, byteSize: body.length });
  res.status(201).json({ objectKey, url: `/api/uploads/${objectKey}`, byteSize: body.length });
});

router.get("/uploads/:ownerId/:fileName", requireAuth, async (req, res): Promise<void> => {
  const ownerId = String(req.params.ownerId);
  if (req.user?.role !== "ADMIN" && req.user?.id !== ownerId) {
    res.status(403).json({ error: "Bạn không có quyền xem ảnh này." });
    return;
  }
  const fileName = String(req.params.fileName);
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(fileName)) {
    res.status(400).json({ error: "Tên ảnh không hợp lệ." });
    return;
  }
  const absolutePath = path.resolve(uploadRoot, ownerId, fileName);
  const allowedPrefix = `${path.resolve(uploadRoot, ownerId)}${path.sep}`;
  if (!absolutePath.startsWith(allowedPrefix)) {
    res.status(400).json({ error: "Đường dẫn không hợp lệ." });
    return;
  }
  try {
    const content = await readFile(absolutePath);
    res.type(path.extname(fileName)).send(content);
  } catch {
    res.status(404).json({ error: "Không tìm thấy ảnh." });
  }
});

router.delete("/uploads/:ownerId/:fileName", requireAuth, async (req, res): Promise<void> => {
  const ownerId = String(req.params.ownerId);
  if (req.user?.role !== "ADMIN" && req.user?.id !== ownerId) {
    res.status(403).json({ error: "Bạn không có quyền xóa ảnh này." });
    return;
  }
  const fileName = String(req.params.fileName);
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(fileName)) {
    res.status(400).json({ error: "Tên ảnh không hợp lệ." });
    return;
  }
  try {
    await unlink(path.resolve(uploadRoot, ownerId, fileName));
    await audit(req.user?.id ?? null, "DELETE_UPLOAD", "file", `${ownerId}/${fileName}`);
  } catch {
    res.status(404).json({ error: "Không tìm thấy ảnh." });
    return;
  }
  res.status(204).send();
});

export default router;