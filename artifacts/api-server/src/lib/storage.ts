import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Cloudflare R2 dùng API tương thích S3, nên có thể dùng thẳng @aws-sdk/client-s3.
// Cần 4 biến môi trường: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.

let client: S3Client | null = null;

function getConfig() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Thiếu cấu hình Cloudflare R2 (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).",
    );
  }
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

function getClient(): { s3: S3Client; bucket: string } {
  const { accountId, bucket, accessKeyId, secretAccessKey } = getConfig();
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
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
