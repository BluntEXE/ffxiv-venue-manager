import { describe, it, expect, vi, beforeEach } from "vitest"
import type { User, Membership, Shift } from "@/generated/prisma/client"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    membership: { findFirst: vi.fn() },
    shift: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    shiftSignupEmbed: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/discord-bot", () => ({
  editBotMessage: vi.fn().mockResolvedValue(undefined),
  postBotMessage: vi.fn().mockResolvedValue("msg-id"),
  getGuildIconUrl: vi.fn().mockResolvedValue(null),
}))

import { prisma } from "@/lib/prisma"
import { editBotMessage } from "@/lib/discord-bot"
import { handleShiftDecline, handleShiftMaybe } from "./shift-bot"

const baseEmbed = {
  id: "embed-1",
  venueId: "venue-1",
  eventId: "event-1",
  templateName: "Bartender",
  discordMessageId: "msg-1",
  channelId: "chan-1",
  scheduledStart: new Date("2026-08-11T19:00:00Z"),
  scheduledEnd: new Date("2026-08-11T23:00:00Z"),
  slots: 2,
  waitlist: [],
  postedAt: new Date("2026-08-01T00:00:00Z"),
  cancelledAt: null,
  event: { title: "Grand Opening" },
  venue: { name: "Velvet Rift", settings: { shiftBot: { thumbnailUrl: "https://example.com/icon.png" } } },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveMembershipAndShift (via handleShiftDecline/handleShiftMaybe)", () => {
  it("short-circuits without querying membership/shift when no matching user", async () => {
    vi.mocked(prisma.shiftSignupEmbed.findUnique).mockResolvedValueOnce(baseEmbed)
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null)

    const result = await handleShiftDecline("embed-1", "discord-999")

    expect(prisma.membership.findFirst).not.toHaveBeenCalled()
    expect(prisma.shift.findFirst).not.toHaveBeenCalled()
    expect(result.content).toBe("You were not signed up for this shift.")
  })

  it("short-circuits without querying shift when no active membership", async () => {
    vi.mocked(prisma.shiftSignupEmbed.findUnique).mockResolvedValueOnce(baseEmbed)
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ id: "user-1" } as unknown as User)
    vi.mocked(prisma.membership.findFirst).mockResolvedValueOnce(null)

    const result = await handleShiftDecline("embed-1", "discord-1")

    expect(prisma.shift.findFirst).not.toHaveBeenCalled()
    expect(result.content).toBe("You were not signed up for this shift.")
  })

  it("cancels the shift and refreshes the embed when a matching shift exists", async () => {
    vi.mocked(prisma.shiftSignupEmbed.findUnique).mockResolvedValueOnce(baseEmbed)
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ id: "user-1" } as unknown as User)
    vi.mocked(prisma.membership.findFirst).mockResolvedValueOnce({ id: "membership-1" } as unknown as Membership)
    vi.mocked(prisma.shift.findFirst).mockResolvedValueOnce({ id: "shift-1" } as unknown as Shift)
    vi.mocked(prisma.shift.findMany).mockResolvedValueOnce([])

    const result = await handleShiftDecline("embed-1", "discord-1")

    expect(prisma.shift.update).toHaveBeenCalledWith({
      where: { id: "shift-1" },
      data: { status: "CANCELLED" },
    })
    expect(editBotMessage).toHaveBeenCalledOnce()
    expect(result.content).toBe("You have been removed from this shift.")
  })
})

describe("refreshEmbedFromRecord (via handleShiftMaybe)", () => {
  it("derives eventTitle/venueName/thumbnailUrl from the embed's relations when refreshing", async () => {
    vi.mocked(prisma.shiftSignupEmbed.findUnique).mockResolvedValueOnce(baseEmbed)
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.shift.findMany).mockResolvedValueOnce([])

    await handleShiftMaybe("embed-1", "discord-1", "SomeUser")

    expect(editBotMessage).toHaveBeenCalledOnce()
    const [, , payload] = vi.mocked(editBotMessage).mock.calls[0]
    expect(payload.embeds?.[0]).toMatchObject({
      author: { name: "Velvet Rift" },
      description: expect.stringContaining("Grand Opening"),
      thumbnail: { url: "https://example.com/icon.png" },
    })
  })
})
