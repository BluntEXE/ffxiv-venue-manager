import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(50, "Display name too long (max 50 characters)"),
})

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  let displayName: string
  try {
    displayName = profileSchema.parse(body).displayName
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    throw error
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { displayName },
    select: { id: true, displayName: true },
  })

  return NextResponse.json(user)
}
