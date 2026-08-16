import { prisma } from "@/lib/prisma"
import type { MembershipRole } from "../generated/prisma/enums"

export type NotificationType = "NEW_FOLLOWER" | "STAFF_JOINED" | "TASK_ASSIGNED" | "TASK_COMPLETED"

interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  link?: string
}

/** Notify all owners (and optionally managers) of a venue */
export async function notifyVenueOwners(
  venueId: string,
  input: Omit<CreateNotificationInput, "userId">,
  roles: MembershipRole[] = ["OWNER"]
): Promise<void> {
  const members = await prisma.membership.findMany({
    where: { venueId, role: { in: roles }, status: "active", userId: { not: null } },
    select: { userId: true },
  })
  if (members.length === 0) return
  await prisma.notification.createMany({
    data: members.map((m) => ({ ...input, userId: m.userId! })),
    skipDuplicates: true,
  })
}
