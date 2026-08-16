import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js"
import prisma from "../../utils/prisma.js"
import { rankForXp, levelFromXp, type GrandCompany } from "../../utils/xp.js"

export default {
  data: new SlashCommandBuilder().setName("leaderboard").setDescription("Top members by XP in the realm"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const rows = await prisma.$queryRaw<{ discordId: string; xp: string; gc: string | null }[]>`
      SELECT "discordId", xp::text, gc FROM discord_members
      ORDER BY xp DESC LIMIT 10
    `

    if (rows.length === 0) {
      await interaction.editReply({ content: "No members on the boards yet." })
      return
    }

    const medals = ["🥇", "🥈", "🥉"]
    const lines = rows.map((r, i) => {
      const xp = parseInt(r.xp, 10)
      const gc = (r.gc as GrandCompany | null) ?? null
      const rank = rankForXp(xp, gc)
      const level = levelFromXp(xp)
      const medal = medals[i] ?? `**${i + 1}.**`
      return `${medal} <@${r.discordId}> — **Lv.${level}** · ${xp.toLocaleString()} XP · ${rank.name}`
    })

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle("⚔️ Grand Company Leaderboard")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "/rank to check your own position" })
      .setTimestamp()

    await interaction.editReply({ embeds: [embed] })
  },
}
