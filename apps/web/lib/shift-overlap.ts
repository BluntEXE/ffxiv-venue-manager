import { prisma } from "@/lib/prisma"

/**
 * True if the membership already holds a CLAIMED/SCHEDULED/ACTIVE shift
 * whose time range overlaps [scheduledStart, scheduledEnd).
 */
export async function hasOverlappingShift(
  membershipId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeShiftId: string
): Promise<boolean> {
  const overlapping = await prisma.shift.findFirst({
    where: {
      membershipId,
      id: { not: excludeShiftId },
      status: { in: ["CLAIMED", "SCHEDULED", "ACTIVE"] },
      scheduledStart: { lt: scheduledEnd },
      scheduledEnd: { gt: scheduledStart },
    },
    select: { id: true },
  })
  return overlapping !== null
}
