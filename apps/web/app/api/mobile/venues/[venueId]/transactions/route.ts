import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { createTransaction, createTransactionSchema } from "@/lib/api/transactions"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const { venueId } = await params

  const membership = await prisma.membership.findFirst({
    where: { userId, venueId, status: "active" },
  })
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this venue" }, { status: 403 })
  }

  const activeShift = await prisma.shift.findFirst({
    where: { membershipId: membership.id, status: "ACTIVE" },
  })
  if (!activeShift) {
    return NextResponse.json(
      { error: "You must be clocked in to log a sale" },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = createTransactionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    )
  }

  const transaction = await createTransaction(venueId, userId, parsed.data)
  return NextResponse.json({ success: true, transaction }, { status: 201 })
}
