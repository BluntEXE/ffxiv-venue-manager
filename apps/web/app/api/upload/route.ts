import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { getUploadUrl, BUCKET, s3 } from "@/lib/storage"
import { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3"
import { randomBytes } from "crypto"
import path from "path"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

// Ensure bucket exists and is publicly readable on first call
let bucketReady = false
async function ensureBucket() {
  if (bucketReady) return
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    // Make bucket publicly readable
    await s3.send(new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: `arn:aws:s3:::${BUCKET}/*` }],
      }),
    }))
    // Allow browsers to PUT directly via presigned URLs (CORS)
    await s3.send(new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: ["*"],
          AllowedMethods: ["GET", "PUT"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        }],
      },
    }))
  }
  bucketReady = true
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { filename, contentType, size } = await req.json()

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP and GIF images are allowed." }, { status: 400 })
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be under 10 MB." }, { status: 400 })
  }

  await ensureBucket()

  const ext  = path.extname(filename) || `.${contentType.split("/")[1]}`
  const key  = `venues/${session.user.id}/${randomBytes(8).toString("hex")}${ext}`
  const uploadUrl = await getUploadUrl(key, contentType)

  // Return the public URL separately so the client never needs to derive it from the presigned URL
  const base = process.env.MINIO_PUBLIC_URL ?? process.env.MINIO_ENDPOINT ?? "http://localhost:9000"
  const storedUrl = `${base}/${BUCKET}/${key}`

  return NextResponse.json({ uploadUrl, key, storedUrl })
}
