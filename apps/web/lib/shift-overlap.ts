import { prisma } from "@/lib/prisma"
import type { Shift } from "@/generated/prisma/client"

export type ClaimResult =
  | { merged: true; shift: Shift }
  | { merged: false; shift: Shift }
  | null // shift was claimed/changed concurrently

/**
 * Claim an OPEN shift for a membership.
 *
 * If the membership already holds a CLAIMED/SCHEDULED/ACTIVE shift for the
 * same role whose time range overlaps or is back-to-back with this one
 * (e.g. an existing 5-9pm shift and a newly claimed 7-11pm shift), the two
 * are merged into a single shift spanning the full range instead of leaving
 * two separate rows. The merged shift keeps the existing shift's id and
 * status (so an already-approved SCHEDULED/ACTIVE shift doesn't need
 * re-approval just because it got longer), and the newly claimed OPEN row
 * is deleted.
 *
 * Returns null if the shift was no longer OPEN by the time we tried to
 * claim it (claimed/changed concurrently).
 */
export async function claimShiftWithMerge(shift: Shift, membershipId: string): Promise<ClaimResult> {
  const mergeable = await prisma.shift.findFirst({
    where: {
      membershipId,
      id: { not: shift.id },
      roleId: shift.roleId,
      status: { in: ["CLAIMED", "SCHEDULED", "ACTIVE"] },
      scheduledStart: { lte: shift.scheduledEnd },
      scheduledEnd: { gte: shift.scheduledStart },
    },
  })

  return prisma.$transaction(async (tx) => {
    const stillOpen = await tx.shift.findFirst({ where: { id: shift.id, status: "OPEN" } })
    if (!stillOpen) return null

    if (mergeable) {
      const scheduledStart = mergeable.scheduledStart < shift.scheduledStart ? mergeable.scheduledStart : shift.scheduledStart
      const scheduledEnd = mergeable.scheduledEnd > shift.scheduledEnd ? mergeable.scheduledEnd : shift.scheduledEnd

      const updated = await tx.shift.update({
        where: { id: mergeable.id },
        data: { scheduledStart, scheduledEnd },
      })
      await tx.shift.delete({ where: { id: shift.id } })
      return { merged: true, shift: updated }
    }

    const updated = await tx.shift.update({
      where: { id: shift.id },
      data: { membershipId, status: "CLAIMED" },
    })
    return { merged: false, shift: updated }
  })
}
