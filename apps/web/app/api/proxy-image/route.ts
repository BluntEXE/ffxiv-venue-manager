import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  const allowedBase = process.env.MINIO_PUBLIC_URL ?? ""
  const bucket = process.env.MINIO_BUCKET ?? "xiv-venues"
  if (!allowedBase || !url.startsWith(`${allowedBase}/${bucket}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: 502 })

    const contentType = res.headers.get("content-type") ?? "image/jpeg"
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 })
  }
}
