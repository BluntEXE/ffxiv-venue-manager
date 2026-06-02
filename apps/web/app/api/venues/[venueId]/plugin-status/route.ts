import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ lastUsedAt: null })

  const { venueId } = await params

  const key = await prisma.apiKey.findFirst({
    where: { venueId },
    orderBy: { lastUsedAt: "desc" },
    select: { lastUsedAt: true },
  })

  return NextResponse.json({ lastUsedAt: key?.lastUsedAt ?? null })
}
