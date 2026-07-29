import { prisma } from "@/lib/prisma"

/**
 * Queue a "shift starting soon" reminder for 1 hour before scheduledStart.
 * No-op if scheduledStart is less than an hour away (nothing meaningful to remind about)
 * or if there's no assigned user (open shifts have no one to notify).
 */
export function queueShiftReminder(
  userId: string,
  venueId: string,
  venueName: string,
  shiftId: string,
  scheduledStart: Date
) {
  const reminderAt = new Date(scheduledStart.getTime() - 60 * 60 * 1000)
  if (reminderAt <= new Date()) return

  return prisma.pendingNotification.create({
    data: {
      userId,
      type: "SHIFT_REMINDER",
      title: "Shift starting soon",
      body: `Your shift at ${venueName} starts in 1 hour.`,
      data: { venueId, shiftId },
      scheduledFor: reminderAt,
    },
  }).catch(() => {}) // non-blocking, matches existing behavior
}
