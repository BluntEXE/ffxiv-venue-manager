import { verifyMobileJwt } from "@/lib/auth/mobile-auth"
import { prisma } from "@/lib/prisma"

export type OperatorContext = {
  userId: string
  venueId: string
  role: "OWNER" | "MANAGER"
}

export async function requireOperator(
  req: Request,
  venueId: string
): Promise<OperatorContext | Response> {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) {
    const { NextResponse } = await import("next/server")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let userId: string
  try {
    const payload = await verifyMobileJwt(auth)
    userId = payload.sub
  } catch {
    const { NextResponse } = await import("next/server")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      venueId,
      status: "active",
      role: { in: ["OWNER", "MANAGER"] },
    },
    select: { role: true },
  })

  if (!membership) {
    const { NextResponse } = await import("next/server")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return { userId, venueId, role: membership.role as "OWNER" | "MANAGER" }
}

export function isOperatorContext(v: unknown): v is OperatorContext {
  return typeof v === "object" && v !== null && "userId" in v
}
