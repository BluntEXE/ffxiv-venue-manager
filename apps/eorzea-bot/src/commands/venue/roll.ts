import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js"
import prisma from "../../utils/prisma.js"

interface VenueRow {
  name: string
  slug: string
  dataCenter: string
  world: string
  district: string | null
  ward: number | null
  plot: number | null
  scheduledStart: Date
  scheduledEnd: Date
}

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Get a random venue open right now — feeling adventurous?")
    .addStringOption((o) =>
      o.setName("datacenter").setDescription("Filter by data center (e.g. Crystal, Aether, Primal)")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const dc = interaction.options.getString("datacenter")
    const now = new Date()

    const rows = dc
      ? await prisma.$queryRaw<VenueRow[]>`
          SELECT v.name, v.slug, v."dataCenter", v.world, v.district, v.ward, v.plot,
                 s."scheduledStart", s."scheduledEnd"
          FROM venues v
          JOIN shifts s ON s."venueId" = v.id
          WHERE v."isActive" = true
            AND v."venueType" != 'TEST_VENUE'
            AND s.status IN ('SCHEDULED', 'OPEN', 'ACTIVE')
            AND s."scheduledStart" <= ${now}
            AND s."scheduledEnd" >= ${now}
            AND v."dataCenter" ILIKE ${dc}
          ORDER BY RANDOM()
          LIMIT 1
        `
      : await prisma.$queryRaw<VenueRow[]>`
          SELECT v.name, v.slug, v."dataCenter", v.world, v.district, v.ward, v.plot,
                 s."scheduledStart", s."scheduledEnd"
          FROM venues v
          JOIN shifts s ON s."venueId" = v.id
          WHERE v."isActive" = true
            AND v."venueType" != 'TEST_VENUE'
            AND s.status IN ('SCHEDULED', 'OPEN', 'ACTIVE')
            AND s."scheduledStart" <= ${now}
            AND s."scheduledEnd" >= ${now}
          ORDER BY RANDOM()
          LIMIT 1
        `

    if (rows.length === 0) {
      const msg = dc
        ? `No venues open right now on **${dc}**. Try broadening your search!`
        : "No venues open right now. Check back later or visit **[xivvenuemanager.com](https://xivvenuemanager.com/discover)** to browse upcoming events."
      await interaction.editReply({ content: msg })
      return
    }

    const v = rows[0]
    const location = [v.district, v.ward != null ? `Ward ${v.ward}` : null, v.plot != null ? `Plot ${v.plot}` : null]
      .filter(Boolean)
      .join(", ")

    const fmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle(`🎲 ${v.name}`)
      .setDescription(`Open right now and ready for visitors.`)
      .addFields(
        { name: "🌍 World", value: `${v.dataCenter} · ${v.world}`, inline: true },
        { name: "🏠 Location", value: location || "See profile", inline: true },
        { name: "🕐 Open Until", value: `${fmt(v.scheduledEnd)} ST`, inline: true }
      )
      .setURL(`https://xivvenuemanager.com/venues/${v.slug}`)
      .setFooter({ text: "XIV Venue Manager · /roll again for a different venue" })
      .setTimestamp()

    await interaction.editReply({ embeds: [embed] })
  },
}
