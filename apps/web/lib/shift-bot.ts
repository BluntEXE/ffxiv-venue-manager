import { prisma } from "@/lib/prisma"
import { editBotMessage, getGuildIconUrl, postBotMessage, type BotMessagePayload } from "@/lib/discord-bot"
import type { ShiftTemplate } from "@xiv-venue-manager/types"
import type { Prisma } from "@/generated/prisma/client"

/** Cast a typed array back to Prisma's opaque JSON array type. */
const asJsonArray = (v: unknown[]): Prisma.InputJsonArray => v as unknown as Prisma.InputJsonArray

const XIV_BLUE = 0x00b4ff

interface WaitlistEntry {
  discordUserId: string
  discordUsername: string
  signedUpAt: string
}

/**
 * Build the Discord embed payload for a shift signup.
 */
export function buildShiftEmbed(
  embed: {
    id: string
    templateName: string
    eventTitle: string
    venueName: string
    scheduledStart: Date
    scheduledEnd: Date
    slots: number
    waitlist: WaitlistEntry[]
    thumbnailUrl?: string | null
  },
  acceptedCount: number,
  acceptedNames: string[]
): BotMessagePayload {
  const slotsRemaining = embed.slots - acceptedCount
  const startTs = Math.floor(embed.scheduledStart.getTime() / 1000)
  const endTs = Math.floor(embed.scheduledEnd.getTime() / 1000)

  const acceptedField = acceptedCount > 0
    ? acceptedNames.map((n, i) => `${i + 1}. ${n}`).join("\n")
    : "_No one yet_"

  const waitlistField = embed.waitlist.length > 0
    ? embed.waitlist.map((w, i) => `${i + 1}. ${w.discordUsername}`).join("\n")
    : null

  const fields: object[] = [
    { name: "Time", value: `<t:${startTs}:F> – <t:${endTs}:t> (<t:${startTs}:R>)`, inline: false },
    { name: `Accepted (${acceptedCount}/${embed.slots})`, value: acceptedField, inline: true },
  ]

  if (waitlistField) {
    fields.push({ name: `Maybe (${embed.waitlist.length})`, value: waitlistField, inline: true })
  }

  const buttons: import("@/lib/discord-bot").DiscordButtonComponent[] = [
    { type: 2, style: 3, label: `✓ Accept${slotsRemaining <= 0 ? " (Full)" : ""}`, custom_id: `shift_accept:${embed.id}` },
    { type: 2, style: 2, label: "? Maybe", custom_id: `shift_maybe:${embed.id}` },
    { type: 2, style: 4, label: "✗ Decline", custom_id: `shift_decline:${embed.id}` },
  ]

  const embedObj: Record<string, unknown> = {
    author: { name: embed.venueName },
    title: embed.templateName,
    description: `Shift signup · ${embed.eventTitle}`,
    color: XIV_BLUE,
    fields,
    footer: { text: "XIV Venue Manager" },
  }

  if (embed.thumbnailUrl) {
    embedObj.thumbnail = { url: embed.thumbnailUrl }
  }

  return {
    embeds: [embedObj],
    components: [{ type: 1 as const, components: buttons }],
  }
}

/**
 * Re-fetch accepted names and edit the Discord message to reflect current state.
 */
async function refreshEmbed(embedRecord: {
  id: string
  templateName: string
  scheduledStart: Date
  scheduledEnd: Date
  slots: number
  waitlist: unknown
  channelId: string
  discordMessageId: string
  eventTitle?: string
  venueName?: string
  thumbnailUrl?: string | null
}) {
  const acceptedShifts = await prisma.shift.findMany({
    where: { shiftSignupEmbedId: embedRecord.id, status: { not: "CANCELLED" } },
    include: { membership: { include: { user: true } } },
  })

  const acceptedNames = acceptedShifts.map(
    (s) => s.membership?.user?.name ?? "Unknown"
  )

  const payload = buildShiftEmbed(
    {
      id: embedRecord.id,
      templateName: embedRecord.templateName,
      eventTitle: embedRecord.eventTitle ?? "",
      venueName: embedRecord.venueName ?? "",
      scheduledStart: embedRecord.scheduledStart,
      scheduledEnd: embedRecord.scheduledEnd,
      slots: embedRecord.slots,
      waitlist: embedRecord.waitlist as unknown as WaitlistEntry[],
      thumbnailUrl: embedRecord.thumbnailUrl,
    },
    acceptedShifts.length,
    acceptedNames
  )

  await editBotMessage(embedRecord.channelId, embedRecord.discordMessageId, payload)
}

export async function handleShiftAccept(
  embedId: string,
  discordUserId: string,
  discordUsername: string
): Promise<{ content: string }> {
  const embed = await prisma.shiftSignupEmbed.findUnique({
    where: { id: embedId },
    include: {
      shifts: { where: { status: { not: "CANCELLED" } } },
      event: { select: { title: true } },
      venue: { select: { name: true, settings: true } },
    },
  })

  if (!embed || embed.cancelledAt) return { content: "This shift is no longer available." }

  const user = await prisma.user.findFirst({ where: { discordId: discordUserId } })
  if (!user) return { content: "You need to sign up at xivvenuemanager.com first." }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, venueId: embed.venueId, status: "active" },
  })
  if (!membership) return { content: "You are not a staff member of this venue." }

  const existing = await prisma.shift.findFirst({
    where: { shiftSignupEmbedId: embedId, membershipId: membership.id, status: { not: "CANCELLED" } },
  })
  if (existing) return { content: "You are already signed up for this shift." }

  const waitlist = embed.waitlist as unknown as WaitlistEntry[]
  const alreadyWaiting = waitlist.some((w) => w.discordUserId === discordUserId)

  let shiftCreated = false
  let newWaitlistPosition = 0

  await prisma.$transaction(async (tx) => {
    const currentAccepted = await tx.shift.count({
      where: { shiftSignupEmbedId: embedId, status: { not: "CANCELLED" } },
    })

    if (currentAccepted >= embed.slots) {
      if (!alreadyWaiting) {
        const newWaitlist: WaitlistEntry[] = [
          ...waitlist,
          { discordUserId, discordUsername, signedUpAt: new Date().toISOString() },
        ]
        await tx.shiftSignupEmbed.update({ where: { id: embedId }, data: { waitlist: asJsonArray(newWaitlist) } })
        newWaitlistPosition = newWaitlist.length
      }
    } else {
      await tx.shift.create({
        data: {
          venueId: embed.venueId,
          membershipId: membership.id,
          scheduledStart: embed.scheduledStart,
          scheduledEnd: embed.scheduledEnd,
          status: "SCHEDULED",
          shiftSignupEmbedId: embedId,
        },
      })
      shiftCreated = true
    }
  })

  if (!shiftCreated) {
    if (alreadyWaiting) return { content: "You are already on the waitlist." }
    const updatedEmbed = await prisma.shiftSignupEmbed.findUnique({
      where: { id: embedId },
      include: { event: { select: { title: true } }, venue: { select: { name: true, settings: true } } },
    })
    if (updatedEmbed) {
      const settings = updatedEmbed.venue?.settings as Record<string, unknown> | null
      const shiftBot = settings?.shiftBot as { thumbnailUrl?: string; cachedGuildIconUrl?: string } | undefined
      await refreshEmbed({ ...updatedEmbed, eventTitle: updatedEmbed.event?.title ?? "", venueName: updatedEmbed.venue?.name ?? "", thumbnailUrl: shiftBot?.thumbnailUrl || shiftBot?.cachedGuildIconUrl })
    }
    return { content: `Slots are full — you have been added to the waitlist (position ${newWaitlistPosition}).` }
  }

  // Merge overlapping/adjacent shifts for this member on the same event
  const newShift = await prisma.shift.findFirst({
    where: { shiftSignupEmbedId: embedId, membershipId: membership.id, status: { not: "CANCELLED" } },
  })
  if (newShift) {
    const overlapping = await prisma.shift.findFirst({
      where: {
        id: { not: newShift.id },
        membershipId: membership.id,
        status: { in: ["CLAIMED", "SCHEDULED", "ACTIVE"] },
        scheduledStart: { lte: newShift.scheduledEnd },
        scheduledEnd: { gte: newShift.scheduledStart },
        shiftSignupEmbed: { eventId: embed.eventId },
      },
    })
    if (overlapping) {
      const mergedStart = overlapping.scheduledStart < newShift.scheduledStart ? overlapping.scheduledStart : newShift.scheduledStart
      const mergedEnd = overlapping.scheduledEnd > newShift.scheduledEnd ? overlapping.scheduledEnd : newShift.scheduledEnd
      await prisma.shift.update({ where: { id: overlapping.id }, data: { scheduledStart: mergedStart, scheduledEnd: mergedEnd } })
      await prisma.shift.delete({ where: { id: newShift.id } })
    }
  }

  const settings = embed.venue?.settings as Record<string, unknown> | null
  const shiftBot = settings?.shiftBot as { thumbnailUrl?: string; cachedGuildIconUrl?: string } | undefined
  await refreshEmbed({ ...embed, eventTitle: embed.event?.title ?? "", venueName: embed.venue?.name ?? "", thumbnailUrl: shiftBot?.thumbnailUrl || shiftBot?.cachedGuildIconUrl })
  return { content: `You are signed up for **${embed.templateName}**. See you there!` }
}

export async function handleShiftDecline(
  embedId: string,
  discordUserId: string
): Promise<{ content: string }> {
  const embed = await prisma.shiftSignupEmbed.findUnique({
    where: { id: embedId },
    include: { event: { select: { title: true } }, venue: { select: { name: true, settings: true } } },
  })
  if (!embed) return { content: "Shift not found." }

  const user = await prisma.user.findFirst({ where: { discordId: discordUserId } })

  if (user) {
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, venueId: embed.venueId, status: "active" },
    })

    if (membership) {
      const shift = await prisma.shift.findFirst({
        where: { shiftSignupEmbedId: embedId, membershipId: membership.id, status: { not: "CANCELLED" } },
      })

      if (shift) {
        await prisma.shift.update({ where: { id: shift.id }, data: { status: "CANCELLED" } })

        const settings = embed.venue?.settings as Record<string, unknown> | null
        const shiftBot = settings?.shiftBot as { thumbnailUrl?: string; cachedGuildIconUrl?: string } | undefined
        const embedWithMeta = { ...embed, eventTitle: embed.event?.title ?? "", venueName: embed.venue?.name ?? "", thumbnailUrl: shiftBot?.thumbnailUrl || shiftBot?.cachedGuildIconUrl }
        await refreshEmbed(embedWithMeta)
        if ((embed.waitlist as unknown as WaitlistEntry[]).length > 0) {
          return { content: "You have been removed from this shift. A slot is now available for those on the maybe list." }
        }
        return { content: "You have been removed from this shift." }
      }
    }
  }

  const waitlist = embed.waitlist as unknown as WaitlistEntry[]
  const newWaitlist = waitlist.filter((w) => w.discordUserId !== discordUserId)
  if (newWaitlist.length < waitlist.length) {
    await prisma.shiftSignupEmbed.update({ where: { id: embedId }, data: { waitlist: asJsonArray(newWaitlist) } })
    const settings = embed.venue?.settings as Record<string, unknown> | null
    const shiftBot = settings?.shiftBot as { thumbnailUrl?: string; cachedGuildIconUrl?: string } | undefined
    await refreshEmbed({ ...embed, waitlist: newWaitlist, eventTitle: embed.event?.title ?? "", venueName: embed.venue?.name ?? "", thumbnailUrl: shiftBot?.thumbnailUrl || shiftBot?.cachedGuildIconUrl })
    return { content: "You have been removed from the waitlist." }
  }

  return { content: "You were not signed up for this shift." }
}

export async function handleShiftMaybe(
  embedId: string,
  discordUserId: string,
  discordUsername: string
): Promise<{ content: string }> {
  const embed = await prisma.shiftSignupEmbed.findUnique({
    where: { id: embedId },
    include: { event: { select: { title: true } }, venue: { select: { name: true, settings: true } } },
  })
  if (!embed || embed.cancelledAt) return { content: "This shift is no longer available." }

  const waitlist = embed.waitlist as unknown as WaitlistEntry[]
  const alreadyWaiting = waitlist.some((w) => w.discordUserId === discordUserId)
  if (alreadyWaiting) return { content: "You are already on the maybe list." }

  const user = await prisma.user.findFirst({ where: { discordId: discordUserId } })
  if (user) {
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, venueId: embed.venueId, status: "active" },
    })
    if (membership) {
      const existing = await prisma.shift.findFirst({
        where: { shiftSignupEmbedId: embedId, membershipId: membership.id, status: { not: "CANCELLED" } },
      })
      if (existing) return { content: "You are already accepted for this shift. Click Decline first to move to maybe." }
    }
  }

  const newWaitlist: WaitlistEntry[] = [
    ...waitlist,
    { discordUserId, discordUsername, signedUpAt: new Date().toISOString() },
  ]
  await prisma.shiftSignupEmbed.update({ where: { id: embedId }, data: { waitlist: asJsonArray(newWaitlist) } })
  const settings = embed.venue?.settings as Record<string, unknown> | null
  const shiftBot = settings?.shiftBot as { thumbnailUrl?: string; cachedGuildIconUrl?: string } | undefined
  await refreshEmbed({ ...embed, waitlist: newWaitlist, eventTitle: embed.event?.title ?? "", venueName: embed.venue?.name ?? "", thumbnailUrl: shiftBot?.thumbnailUrl || shiftBot?.cachedGuildIconUrl })
  return { content: "Marked as maybe — you will be notified if a slot opens up." }
}

/**
 * Post all shift embeds for a single event based on venue templates.
 * Called by the sync-shift-embeds cron.
 */
export async function postShiftEmbedsForEvent(
  eventId: string,
  venueId: string,
  venueName: string,
  eventTitle: string,
  eventStart: Date,
  eventEnd: Date,
  channelId: string,
  templates: ShiftTemplate[],
  thumbnailUrl?: string | null,
  cachedGuildIconUrl?: string | null,
  onGuildIconFetched?: (url: string) => Promise<void>
): Promise<void> {
  // Resolve thumbnail: custom URL > cached guild icon > auto-fetch
  let resolvedThumbnail = thumbnailUrl || cachedGuildIconUrl || null
  if (!resolvedThumbnail) {
    const fetched = await getGuildIconUrl(channelId)
    if (fetched) {
      resolvedThumbnail = fetched
      if (onGuildIconFetched) await onGuildIconFetched(fetched)
    }
  }

  for (const template of templates) {
    const scheduledStart = new Date(eventStart.getTime() + template.startOffsetHours * 3_600_000)
    const scheduledEnd = new Date(scheduledStart.getTime() + template.durationHours * 3_600_000)

    const existing = await prisma.shiftSignupEmbed.findUnique({
      where: { eventId_templateName: { eventId, templateName: template.name } },
    })
    if (existing) continue

    const embedMeta = { eventTitle, venueName, thumbnailUrl: resolvedThumbnail }

    const tempPayload = buildShiftEmbed(
      { id: "pending", templateName: template.name, ...embedMeta, scheduledStart, scheduledEnd, slots: template.slots, waitlist: [] },
      0, []
    )

    const messageId = await postBotMessage(channelId, tempPayload)

    const record = await prisma.shiftSignupEmbed.create({
      data: { venueId, eventId, templateName: template.name, discordMessageId: messageId, channelId, scheduledStart, scheduledEnd, slots: template.slots },
    })

    const finalPayload = buildShiftEmbed(
      { id: record.id, templateName: template.name, ...embedMeta, scheduledStart, scheduledEnd, slots: template.slots, waitlist: [] },
      0, []
    )
    try {
      await editBotMessage(channelId, messageId, finalPayload)
    } catch (err) {
      await prisma.shiftSignupEmbed.delete({ where: { id: record.id } })
      throw err
    }
  }
}

/**
 * Cancel all shift embeds for an event (called when event is cancelled on Partake).
 */
export async function cancelShiftEmbedsForEvent(eventId: string): Promise<void> {
  const embeds = await prisma.shiftSignupEmbed.findMany({
    where: { eventId, cancelledAt: null },
  })

  for (const embed of embeds) {
    try {
      await editBotMessage(embed.channelId, embed.discordMessageId, {
        embeds: [{
          title: `~~${embed.templateName}~~ — CANCELLED`,
          color: 0xff4444,
          description: "This shift has been cancelled.",
        }],
        components: [],
      })
    } catch (err) {
      console.error(`[ShiftBot] Failed to edit cancelled embed ${embed.id}:`, err)
    }

    await prisma.shift.updateMany({
      where: { shiftSignupEmbedId: embed.id, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    })

    await prisma.shiftSignupEmbed.update({
      where: { id: embed.id },
      data: { cancelledAt: new Date() },
    })
  }
}
