import { Client } from "discord.js"
import prisma from "../utils/prisma.js"

const WINDOW_MINUTES = 30
const POLL_INTERVAL_MS = 60_000

export function startShiftReminder(client: Client) {
  setInterval(() => runReminders(client), POLL_INTERVAL_MS)
  console.log("[ShiftReminder] Started — polling every 60s")
}

async function runReminders(client: Client) {
  const now = new Date()
  const windowStart = new Date(now.getTime() + (WINDOW_MINUTES - 1) * 60_000)
  const windowEnd = new Date(now.getTime() + (WINDOW_MINUTES + 1) * 60_000)

  try {
    const shifts = await prisma.$queryRaw<
      {
        id: string
        scheduledStart: Date
        scheduledEnd: Date
        discordId: string
        venueName: string
      }[]
    >`
      SELECT
        s.id,
        s."scheduledStart",
        s."scheduledEnd",
        u."discordId",
        v.name AS "venueName"
      FROM shifts s
      JOIN memberships m ON m.id = s."membershipId"
      JOIN users u ON u.id = m."userId"
      JOIN venues v ON v.id = s."venueId"
      WHERE s.status = 'SCHEDULED'
        AND s."reminded_at" IS NULL
        AND s."scheduledStart" >= ${windowStart}
        AND s."scheduledStart" <= ${windowEnd}
        AND u."discordId" IS NOT NULL
    `

    for (const shift of shifts) {
      await sendReminder(client, shift)

      await prisma.$executeRaw`
        UPDATE shifts SET reminded_at = NOW() WHERE id = ${shift.id}
      `
    }
  } catch (err) {
    console.error("[ShiftReminder] Poll error:", err)
  }
}

async function sendReminder(
  client: Client,
  shift: {
    id: string
    scheduledStart: Date
    scheduledEnd: Date
    discordId: string
    venueName: string
  }
) {
  const user = await client.users.fetch(shift.discordId).catch(() => null)
  if (!user) return

  const start = shift.scheduledStart
  const end = shift.scheduledEnd
  const timeStr = `<t:${Math.floor(start.getTime() / 1000)}:t> — <t:${Math.floor(end.getTime() / 1000)}:t>`

  await user
    .send({
      embeds: [
        {
          color: 0x00b4ff,
          title: "⏰ Shift Starting Soon",
          description: `Your shift at **${shift.venueName}** starts in ~${WINDOW_MINUTES} minutes.`,
          fields: [{ name: "Time", value: timeStr, inline: true }],
          footer: { text: "Use the plugin to clock in when you arrive · XIV Venue Manager" },
          timestamp: new Date().toISOString(),
        },
      ],
    })
    .catch(() => null)
}
