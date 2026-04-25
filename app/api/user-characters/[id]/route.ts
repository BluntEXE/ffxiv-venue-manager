import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * DELETE /api/user-characters/:id
 *
 * Unlink a character. Scoped by userId so you can't delete someone else's
 * link even if you guess the id. PatronLog rows retain their
 * characterName/world/workingUserId snapshot - unlinking doesn't rewrite
 * history, it just stops future visits from classifying as this user.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const result = await prisma.userCharacter.deleteMany({
    where: { id, userId: session.user.id },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
