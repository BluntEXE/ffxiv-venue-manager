import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(50, "Display name too long (max 50 characters)")
    .optional(),
  notifications: z
    .object({
      newFollower: z.boolean().optional(),
      eventRsvp: z.boolean().optional(),
      lowStaffCoverage: z.boolean().optional(),
      dailySummary: z.boolean().optional(),
    })
    .optional(),
})

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  let parsed: z.infer<typeof profileSchema>
  try {
    parsed = profileSchema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    throw error
  }

  const updateData: { displayName?: string; settings?: Prisma.InputJsonValue } = {}

  if (parsed.displayName !== undefined) {
    updateData.displayName = parsed.displayName
  }

  if (parsed.notifications !== undefined) {
    const existingUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { settings: true },
    })
    const currentSettings = (existingUser?.settings as Record<string, unknown>) ?? {}
    updateData.settings = {
      ...currentSettings,
      notifications: parsed.notifications,
    } as Prisma.InputJsonValue
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: { id: true, displayName: true, settings: true },
  })

  return NextResponse.json(user)
}
