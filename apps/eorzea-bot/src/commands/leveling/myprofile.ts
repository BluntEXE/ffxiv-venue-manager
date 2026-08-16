import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js"
import prisma from "../../utils/prisma.js"
import {
  rankForXp,
  nextRankThreshold,
  RANK_THRESHOLDS,
  levelFromXp,
  loyaltyTier,
  GC_LABELS,
  GC_EMOJI,
  type GrandCompany,
} from "../../utils/xp.js"

export default {
  data: new SlashCommandBuilder()
    .setName("myprofile")
    .setDescription("View your community profile")
    .addUserOption((o) => o.setName("member").setDescription("Member to look up (defaults to you)")),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const target = interaction.options.getUser("member") ?? interaction.user
    const member = await interaction.guild?.members.fetch(target.id).catch(() => null)
    const displayName = member?.displayName ?? target.username

    const rows = await prisma.$queryRaw<{ xp: string; gil: string; gc: string | null; created_at: string }[]>`
      SELECT xp::text, gil::text, gc, "createdAt"::text AS created_at
      FROM discord_members WHERE "discordId" = ${target.id}
    `

    const data = rows[0]
    if (!data) {
      await interaction.editReply({
        content:
          target.id === interaction.user.id
            ? "No profile yet — start chatting to earn XP and build your record."
            : `${displayName} doesn't have a profile yet.`,
      })
      return
    }

    const xp = parseInt(data.xp, 10)
    const gil = parseInt(data.gil, 10)
    const gc = (data.gc as GrandCompany | null) ?? null
    const level = levelFromXp(xp)
    const rank = rankForXp(xp, gc)
    const next = nextRankThreshold(xp)
    const current = RANK_THRESHOLDS[rank.index]

    // Platform stats — venue visits and completed shifts via raw SQL
    const platformRows = await prisma.$queryRaw<{ visits: string; shifts: string }[]>`
      SELECT
        (
          SELECT COUNT(*)::text FROM patron_logs pl
          JOIN user_characters uc ON uc."characterName" = pl."characterName" AND uc.world = pl.world
          JOIN users u ON u.id = uc."userId"
          WHERE u."discordId" = ${target.id} AND pl.action = 'ENTER'
        ) AS visits,
        (
          SELECT COUNT(*)::text FROM shifts s
          JOIN memberships m ON m.id = s."membershipId"
          JOIN users u ON u.id = m."userId"
          WHERE u."discordId" = ${target.id} AND s.status = 'COMPLETED'
        ) AS shifts
    `

    const visits = parseInt(platformRows[0]?.visits ?? "0", 10)
    const shifts = parseInt(platformRows[0]?.shifts ?? "0", 10)
    const joinedAt = new Date(data.created_at)

    const nextXpNeeded = next ? next.xp - current.xp : 0
    const nextXpProgress = next ? xp - current.xp : 0

    const fields: { name: string; value: string; inline?: boolean }[] = [
      {
        name: gc ? `${GC_EMOJI[gc]} Grand Company` : "⚔️ Grand Company",
        value: gc ? `${GC_LABELS[gc]}\n**${rank.name}**` : "*Not enlisted — use /gc join*",
        inline: true,
      },
      {
        name: "📊 Standing",
        value: `Level **${level}** · ${xp.toLocaleString()} XP\n${gil.toLocaleString()} Gil 💰`,
        inline: true,
      },
    ]

    if (next) {
      fields.push({
        name: "📈 Next Rank",
        value: `**${nextXpProgress.toLocaleString()} / ${nextXpNeeded.toLocaleString()} XP**\nto ${gc ? rankForXp(next.xp, gc).name : `Flame ${next.suffix}`}`,
        inline: true,
      })
    } else {
      fields.push({ name: "🏆 Rank", value: "Max rank achieved ⭐", inline: true })
    }

    const tier = loyaltyTier(visits)
    fields.push({
      name: "🏛️ Activity",
      value:
        [
          `**${visits.toLocaleString()}** venue visits${tier ? `  ·  ${tier}` : ""}`,
          shifts > 0 ? `**${shifts.toLocaleString()}** shifts worked` : null,
        ]
          .filter(Boolean)
          .join("\n") || "No platform activity yet",
    })

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setAuthor({ name: displayName, iconURL: target.displayAvatarURL() })
      .setTitle("Community Profile")
      .addFields(fields)
      .setFooter({
        text: `Member since ${joinedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      })

    await interaction.editReply({ embeds: [embed] })
  },
}
