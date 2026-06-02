import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deleteObject, keyFromUrl } from "@/lib/storage"

// POST: add a new image URL to gallery
export async function POST(req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  const membership = await prisma.membership.findFirst({
    where: { venueId, userId: session.user.id, role: { in: ["OWNER", "MANAGER"] } },
  })
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const venue = await prisma.venue.update({
    where: { id: venueId },
    data: { galleryImages: { push: url } },
    select: { galleryImages: true },
  })

  return NextResponse.json({ galleryImages: venue.galleryImages })
}

// DELETE: remove an image URL from gallery and delete the object
export async function DELETE(req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  const membership = await prisma.membership.findFirst({
    where: { venueId, userId: session.user.id, role: { in: ["OWNER", "MANAGER"] } },
  })
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { galleryImages: true } })
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = venue.galleryImages.filter((img) => img !== url)
  await prisma.venue.update({ where: { id: venueId }, data: { galleryImages: updated } })

  // Delete from MinIO
  try { await deleteObject(keyFromUrl(url)) } catch { /* best effort */ }

  return NextResponse.json({ galleryImages: updated })
}
