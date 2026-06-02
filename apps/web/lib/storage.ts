import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const creds = {
  accessKeyId:     process.env.MINIO_ROOT_USER     ?? "xivvenues",
  secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? "",
}

// Internal client — used for server-to-server ops (bucket init, delete)
export const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://minio:9000",
  region: "us-east-1",
  credentials: creds,
  forcePathStyle: true,
})

// Public client — presigned URLs must use the browser-reachable hostname
const s3Public = new S3Client({
  endpoint: process.env.MINIO_PUBLIC_URL ?? process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  credentials: creds,
  forcePathStyle: true,
})

export const BUCKET = process.env.MINIO_BUCKET ?? "xiv-venues"

/** Generate a pre-signed upload URL valid for 5 minutes (uses public endpoint) */
export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3Public, command, { expiresIn: 300 })
}

/** Delete a stored object by key */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/** Convert a storage key to a public URL */
export function publicUrl(key: string): string {
  const base = process.env.MINIO_PUBLIC_URL ?? process.env.MINIO_ENDPOINT ?? "http://localhost:9000"
  return `${base}/${BUCKET}/${key}`
}

/** Extract key from a full URL */
export function keyFromUrl(url: string): string {
  const prefix = `/${BUCKET}/`
  const idx = url.indexOf(prefix)
  return idx >= 0 ? url.slice(idx + prefix.length) : url
}
