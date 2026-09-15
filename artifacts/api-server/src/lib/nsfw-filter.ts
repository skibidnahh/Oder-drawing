const HF_INFERENCE_BASE = "https://api-inference.huggingface.co/models/";

// Nhãn model trả về: neutral, drawings, sexy, hentai, porn.
// Mặc định chỉ chặn "porn" và "hentai" (khoả thân/lộ bộ phận nhạy cảm).
// "neutral", "sexy" (bikini/nội y/đồ hở) và "drawings" vẫn được chấp nhận.
const DEFAULT_MODEL = "giacomoarienti/nsfw-classifier";
const DEFAULT_BLOCKED_LABELS = "porn,hentai";
const DEFAULT_THRESHOLD = 0.6;

type HfPrediction = { label: string; score: number };

export type NsfwCheckResult =
  | { blocked: false }
  | { blocked: true; label: string; score: number };

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw.trim().toLowerCase() === "true";
}

function blockedLabelSet(): Set<string> {
  const raw = process.env.NSFW_BLOCKED_LABELS || DEFAULT_BLOCKED_LABELS;
  return new Set(
    raw
      .split(",")
      .map((label) => label.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Bật/tắt bộ lọc NSFW bằng biến môi trường:
 * - NSFW_FILTER_ENABLED=false  -> tắt hẳn, không gọi Hugging Face.
 * - Thiếu HUGGINGFACE_API_KEY  -> tự động tắt (coi như chưa cấu hình).
 */
export function isNsfwFilterEnabled(): boolean {
  return envBool("NSFW_FILTER_ENABLED", true) && Boolean(process.env.HUGGINGFACE_API_KEY);
}

/**
 * Gửi ảnh tới Hugging Face Inference API để phân loại nội dung nhạy cảm.
 * Trả về { blocked: true, label, score } nếu ảnh rơi vào nhãn bị chặn
 * với độ tin cậy >= ngưỡng cấu hình, ngược lại { blocked: false }.
 */
export async function checkImageForNsfw(
  buffer: Buffer,
  contentType: string,
): Promise<NsfwCheckResult> {
  if (!isNsfwFilterEnabled()) return { blocked: false };

  const model = process.env.NSFW_MODEL || DEFAULT_MODEL;
  const threshold = Number(process.env.NSFW_BLOCK_THRESHOLD ?? DEFAULT_THRESHOLD);
  const blocked = blockedLabelSet();
  // Nếu Hugging Face lỗi/timeout: mặc định CHO PHÉP ảnh đi qua (fail-open) để
  // không làm sập tính năng đặt tranh. Đặt NSFW_FAIL_OPEN=false nếu muốn
  // chặn cứng (fail-closed) khi không kiểm duyệt được.
  const failOpen = envBool("NSFW_FAIL_OPEN", true);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    const response = await fetch(`${HF_INFERENCE_BASE}${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        "Content-Type": contentType,
      },
      body: buffer,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      if (failOpen) return { blocked: false };
      throw new Error(`Hugging Face trả về lỗi ${response.status}`);
    }

    const predictions = (await response.json()) as HfPrediction[];
    const hit = predictions.find(
      (item) => blocked.has(item.label.toLowerCase()) && item.score >= threshold,
    );
    if (hit) return { blocked: true, label: hit.label, score: hit.score };
    return { blocked: false };
  } catch (error) {
    if (failOpen) return { blocked: false };
    throw error instanceof Error ? error : new Error("Không thể kiểm duyệt ảnh.");
  }
}
