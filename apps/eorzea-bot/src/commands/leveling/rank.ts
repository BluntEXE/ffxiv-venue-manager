import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js"
import prisma from "../../utils/prisma.js"
import {
  levelFromXp,
  rankForXp,
  nextRankThreshold,
  RANK_THRESHOLDS,
  GC_LABELS,
  GC_EMOJI,
  type GrandCompany,
} from "../../utils/xp.js"

export default {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("View your Grand Company rank and XP progress")
    .addUserOption((o) => o.setName("member").setDescription("Member to look up (defaults to you)")),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const target = interaction.options.getUser("member") ?? interaction.user

    const rows = await prisma.$queryRaw<{ xp: string; gil: string; gc: string | null }[]>`
      SELECT xp::text, gil::text, gc FROM discord_members WHERE "discordId" = ${target.id}
    `

    const member = rows[0]
    if (!member) {
      await interaction.editReply({
        content:
          target.id === interaction.user.id
            ? "No rank yet — start chatting to earn XP!"
            : `${target.username} hasn't earned any XP yet.`,
      })
      return
    }

    const xp = parseInt(member.xp, 10)
    const gil = parseInt(member.gil, 10)
    const gc = (member.gc as GrandCompany | null) ?? null

    const rank = rankForXp(xp, gc)
    const level = levelFromXp(xp)
    const next = nextRankThreshold(xp)
    const current = RANK_THRESHOLDS[rank.index]

    // Progress within current rank bracket
    const bracketSize = next ? next.xp - current.xp : 1
    const bracketXp = xp - current.xp
    const pct = next ? Math.min(100, Math.floor((bracketXp / bracketSize) * 100)) : 100
    const bar = progressBar(pct)

    // Server position
    const posRows = await prisma.$queryRaw<{ pos: string }[]>`
      SELECT (COUNT(*) + 1)::text AS pos FROM discord_members WHERE xp > ${xp}
    `
    const pos = parseInt(posRows[0]?.pos ?? "1", 10)

    const progressLabel = next
      ? `${bracketXp.toLocaleString()} / ${bracketSize.toLocaleString()} XP to **${gc ? rankForXp(next.xp, gc).name : `Flame ${next.suffix}`}**`
      : `Max rank achieved ⭐`

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setAuthor({ name: target.displayName ?? target.username, iconURL: target.displayAvatarURL() })
      .setTitle(`${rank.emoji} ${rank.name}`)
      .setDescription(`**Level ${level}** · Server rank **#${pos}**`)
      .addFields(
        {
          name: "Rank Progress",
          value: `${bar}\n${progressLabel}`,
        },
        {
          name: "📊 Stats",
          value: [
            `**Total XP:** ${xp.toLocaleString()}`,
            `**Gil:** ${gil.toLocaleString()} 💰`,
            gc ? `**Company:** ${GC_EMOJI[gc]} ${GC_LABELS[gc]}` : `**Company:** *Not enlisted — use /gc join*`,
          ].join("\n"),
        }
      )
      .setFooter({ text: "Earn XP by chatting · 60s cooldown per message" })

    await interaction.editReply({ embeds: [embed] })
  },
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 10)
  return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${pct}%`
}
