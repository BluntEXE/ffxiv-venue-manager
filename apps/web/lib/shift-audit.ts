import { prisma } from "@/lib/prisma"

export type ShiftAuditAction = "CLOCK_IN" | "CLOCK_OUT" | "CLAIM" | "APPROVE" | "REJECT"
export type ShiftAuditSource = "web" | "mobile_self" | "mobile_operator" | "plugin"

export function logShiftAudit(
  shiftId: string,
  action: ShiftAuditAction,
  actorUserId: string,
  source: ShiftAuditSource
) {
  return prisma.shiftAuditLog.create({
    data: { shiftId, action, actorUserId, source },
  })
}
