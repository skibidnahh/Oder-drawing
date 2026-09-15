import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../middlewares/auth";
import { audit } from "../lib/audit";
import { checkImageForNsfw } from "../lib/nsfw-filter";
import { deleteObject, getObject, objectExists, putObject } from "../lib/storage";

const router: IRouter = Router();
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
// Vercel giới hạn cứng dung lượng request body ở 4.5MB (không thể tăng).
// Để dưới mức đó một chút cho an toàn (còn chỗ cho header).
const maxBytes = 4 * 1024 * 1024;

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

  try {
    const nsfwResult = await checkImageForNsfw(body, contentType);
    if (nsfwResult.blocked) {
      await audit(req.user!.id, "BLOCK_NSFW_UPLOAD", "file", null, {
        label: nsfwResult.label,
        score: nsfwResult.score,
      });
      res.status(422).json({
        error:
          "Ảnh có nội dung khoả thân/nhạy cảm nên không thể tải lên. Ảnh mặc đồ bình thường, bikini hoặc nội y vẫn được chấp nhận.",
      });
      return;
    }
  } catch {
    res.status(503).json({ error: "Không thể kiểm duyệt ảnh lúc này, vui lòng thử lại sau." });
    return;
  }

  const fileName = `${randomUUID()}.${extensionFor(contentType)}`;
  const objectKey = `${req.user!.id}/${fileName}`;

  try {
    await putObject(objectKey, body, contentType);
  } catch {
    res.status(502).json({ error: "Không thể lưu ảnh lúc này, vui lòng thử lại." });
    return;
  }

  await audit(req.user!.id, "UPLOAD_REFERENCE", "file", objectKey, {
    contentType,
    byteSize: body.length,
  });
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
  const objectKey = `${ownerId}/${fileName}`;
  const object = await getObject(objectKey);
  if (!object) {
    res.status(404).json({ error: "Không tìm thấy ảnh." });
    return;
  }
  res.type(object.contentType || "application/octet-stream").send(object.body);
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
  const objectKey = `${ownerId}/${fileName}`;
  const exists = await objectExists(objectKey);
  if (!exists) {
    res.status(404).json({ error: "Không tìm thấy ảnh." });
    return;
  }
  await deleteObject(objectKey);
  await audit(req.user?.id ?? null, "DELETE_UPLOAD", "file", objectKey);
  res.status(204).send();
});

export default router;
