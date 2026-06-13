import { prisma } from "@/lib/prisma"

/**
 * True if the membership already holds a CLAIMED/SCHEDULED/ACTIVE shift
 * with the exact same start and end time. Partial overlaps (e.g. an
 * early 5-9pm shift and a late 7-11pm shift) are allowed as deliberate
 * handoff coverage — only an identical duplicate slot is rejected.
 */
export async function hasOverlappingShift(
  membershipId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeShiftId: string
): Promise<boolean> {
  const duplicate = await prisma.shift.findFirst({
    where: {
      membershipId,
      id: { not: excludeShiftId },
      status: { in: ["CLAIMED", "SCHEDULED", "ACTIVE"] },
      scheduledStart,
      scheduledEnd,
    },
    select: { id: true },
  })
  return duplicate !== null
}
