import { prisma } from "@/lib/prisma"

export type ShiftAuditAction = "CLOCK_IN" | "CLOCK_OUT" | "CLAIM" | "APPROVE" | "REJECT" | "CANCEL_SERIES"
export type ShiftAuditSource = "web" | "mobile_self" | "mobile_operator" | "plugin" | "discord"

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
