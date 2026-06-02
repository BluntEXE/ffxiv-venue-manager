import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export type NotificationType = "NEW_FOLLOWER" | "STAFF_JOINED" | "TASK_ASSIGNED" | "TASK_COMPLETED"

interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  link?: string
}

/** Queue a web notification for a user. Fire-and-forget safe. */
export async function notify(input: CreateNotificationInput): Promise<void> {
  await prisma.notification.create({ data: input })
}

/** Notify all owners (and optionally managers) of a venue */
export async function notifyVenueOwners(
  venueId: string,
  input: Omit<CreateNotificationInput, "userId">,
  roles: Prisma.EnumMembershipRoleFilter["in"] = ["OWNER"]
): Promise<void> {
  const members = await prisma.membership.findMany({
    where: { venueId, role: { in: roles }, status: "active", userId: { not: null } },
    select: { userId: true },
  })
  if (members.length === 0) return
  await prisma.notification.createMany({
    data: members.map(m => ({ ...input, userId: m.userId! })),
    skipDuplicates: true,
  })
}
