import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getVenue, uploadVenueImage, deleteVenueImage } from "@/lib/api/xvm-api"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

// GET: the venue's current gallery images
export async function GET(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  const gate = await requireXvmVenueId(venueId)
  if (gate.error) return gate.error

  try {
    const detail = await getVenue(token, gate.xvmApiVenueId!)
    return NextResponse.json(detail.images)
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[gallery] GET error")
  }
}

// POST: upload a new gallery image
export async function POST(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  const gate = await requireXvmVenueId(venueId)
  if (gate.error) return gate.error

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 })
  }

  try {
    const image = await uploadVenueImage(token, gate.xvmApiVenueId!, file)
    await invalidateCache(cacheKeys.userVenues(session.user.id))
    return NextResponse.json(image, { status: 201 })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[gallery] POST error")
  }
}

// DELETE: remove a gallery image by id
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  const gate = await requireXvmVenueId(venueId)
  if (gate.error) return gate.error

  let imageId: number
  try {
    const body = await req.json()
    imageId = Number(body?.imageId)
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  if (!Number.isInteger(imageId)) {
    return NextResponse.json({ error: "imageId required" }, { status: 400 })
  }

  try {
    await deleteVenueImage(token, gate.xvmApiVenueId!, imageId)
    await invalidateCache(cacheKeys.userVenues(session.user.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[gallery] DELETE error")
  }
}
