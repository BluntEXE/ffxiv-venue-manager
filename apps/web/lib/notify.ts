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

const NOTIFICATION_PREF_MAP: Record<NotificationType, string> = {
  NEW_FOLLOWER: "newFollower",
  STAFF_JOINED: "lowStaffCoverage",
  TASK_ASSIGNED: "lowStaffCoverage",
  TASK_COMPLETED: "lowStaffCoverage",
}

export async function notifyVenueOwners(
  venueId: string,
  input: Omit<CreateNotificationInput, "userId">,
  roles: MembershipRole[] = ["OWNER"]
): Promise<void> {
  const members = await prisma.membership.findMany({
    where: { venueId, role: { in: roles }, status: "active", userId: { not: null } },
    select: { userId: true, user: { select: { settings: true } } },
  })
  if (members.length === 0) return

  const prefKey = NOTIFICATION_PREF_MAP[input.type]
  const eligible = members.filter((m) => {
    if (!prefKey) return true
    const settings = (m.user?.settings as Record<string, unknown>) ?? {}
    const notifications = (settings.notifications as Record<string, boolean>) ?? {}
    return notifications[prefKey] !== false
  })

  if (eligible.length === 0) return

  await prisma.notification.createMany({
    data: eligible.map((m) => ({ ...input, userId: m.userId! })),
    skipDuplicates: true,
  })
}
