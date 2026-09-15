import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Adapter S3-compatible dùng chung được cho Cloudflare R2, Backblaze B2,
// hoặc bất kỳ dịch vụ nào nói tương thích S3. Chỉ cần đổi 4 biến môi trường,
// không cần sửa code.
//
// S3_ENDPOINT ví dụ:
//   Cloudflare R2:  https://<ACCOUNT_ID>.r2.cloudflarestorage.com
//   Backblaze B2:   https://s3.<region>.backblazeb2.com  (vd: s3.us-west-002.backblazeb2.com)

let client: S3Client | null = null;

function getConfig() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || "auto";

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Thiếu cấu hình lưu trữ ảnh (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).",
    );
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

function getClient(): { s3: S3Client; bucket: string } {
  const { endpoint, bucket, accessKeyId, secretAccessKey, region } = getConfig();
  if (!client) {
    client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // Backblaze B2 (và một số dịch vụ S3-compatible khác) cần path-style thay vì
      // virtual-hosted-style. Bật luôn cho an toàn, không ảnh hưởng tới R2.
      forcePathStyle: true,
    });
  }
  return { s3: client, bucket };
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { s3, bucket } = getClient();
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObject(
  key: string,
): Promise<{ body: Buffer; contentType?: string } | null> {
  const { s3, bucket } = getClient();
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks: Buffer[] = [];
    const stream = result.Body as unknown as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { body: Buffer.concat(chunks), contentType: result.ContentType };
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") return null;
    throw error;
  }
}

export async function objectExists(key: string): Promise<boolean> {
  const { s3, bucket } = getClient();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "NotFound") return false;
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { s3, bucket } = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
