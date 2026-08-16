/**
 * Real-DB integration test for the cluster #4 refactor (refreshEmbedFromRecord/
 * resolveMembershipAndShift). Runs against the local dev Postgres — these handlers
 * are gated behind a real Discord Ed25519 signature in production, so this is the
 * closest available substitute for a live click-through: real Prisma queries and
 * constraints, only the actual Discord API call mocked out.
 *
 * Requires the local dev stack (docker-compose.local.yml) running with the seeded
 * "local-test-venue" / "Ehno Cure" fixture already present.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

vi.mock("@/lib/discord-bot", () => ({
  editBotMessage: vi.fn().mockResolvedValue(undefined),
  postBotMessage: vi.fn().mockResolvedValue("msg-id"),
  getGuildIconUrl: vi.fn().mockResolvedValue(null),
}))

import { prisma } from "@/lib/prisma"
import { editBotMessage } from "@/lib/discord-bot"
import { handleShiftAccept, handleShiftDecline, handleShiftMaybe } from "./shift-bot"

const VENUE_SLUG = "local-test-venue"
const DISCORD_USER_ID = "737311137967767553" // Ehno Cure fixture, matches local seed data

let eventId: string
let embedId: string

beforeAll(async () => {
  const venue = await prisma.venue.findUniqueOrThrow({ where: { slug: VENUE_SLUG } })
  const user = await prisma.user.findFirstOrThrow({ where: { discordId: DISCORD_USER_ID } })

  const event = await prisma.event.create({
    data: {
      venue: { connect: { id: venue.id } },
      createdBy: { connect: { id: user.id } },
      title: "cluster4-integration-test",
      startTime: new Date(Date.now() + 3600_000),
      endTime: new Date(Date.now() + 7200_000),
    },
  })
  eventId = event.id

  const embed = await prisma.shiftSignupEmbed.create({
    data: {
      venue: { connect: { id: venue.id } },
      event: { connect: { id: event.id } },
      templateName: "Integration Test Shift",
      discordMessageId: `test-${Date.now()}`,
      channelId: "test-channel",
      scheduledStart: event.startTime,
      scheduledEnd: event.endTime,
      slots: 1,
    },
  })
  embedId = embed.id
})

afterAll(async () => {
  await prisma.shift.deleteMany({ where: { shiftSignupEmbedId: embedId } })
  await prisma.shiftSignupEmbed.delete({ where: { id: embedId } })
  await prisma.event.delete({ where: { id: eventId } })
})

describe("shift-bot handlers against a real local Postgres", () => {
  it("accept creates a real Shift row and refreshes the embed", async () => {
    const result = await handleShiftAccept(embedId, DISCORD_USER_ID, "EhnoCure")
    expect(result.content).toContain("You are signed up for")

    const shift = await prisma.shift.findFirst({
      where: { shiftSignupEmbedId: embedId, status: { not: "CANCELLED" } },
    })
    expect(shift).not.toBeNull()
    expect(editBotMessage).toHaveBeenCalledOnce()
  })

  it("decline cancels the real Shift row and refreshes the embed", async () => {
    vi.mocked(editBotMessage).mockClear()
    const result = await handleShiftDecline(embedId, DISCORD_USER_ID)
    expect(result.content).toBe("You have been removed from this shift.")

    const shift = await prisma.shift.findFirst({
      where: { shiftSignupEmbedId: embedId, status: { not: "CANCELLED" } },
    })
    expect(shift).toBeNull()
    const cancelledShift = await prisma.shift.findFirst({
      where: { shiftSignupEmbedId: embedId, status: "CANCELLED" },
    })
    expect(cancelledShift).not.toBeNull()
    expect(editBotMessage).toHaveBeenCalledOnce()
  })

  it("maybe adds to the real waitlist JSON column and refreshes the embed", async () => {
    vi.mocked(editBotMessage).mockClear()
    const result = await handleShiftMaybe(embedId, DISCORD_USER_ID, "EhnoCure")
    expect(result.content).toBe("Marked as maybe — you will be notified if a slot opens up.")

    const embed = await prisma.shiftSignupEmbed.findUniqueOrThrow({ where: { id: embedId } })
    const waitlist = embed.waitlist as unknown as { discordUserId: string }[]
    expect(waitlist.some((w) => w.discordUserId === DISCORD_USER_ID)).toBe(true)
    expect(editBotMessage).toHaveBeenCalledOnce()
  })
})
