import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"
import prisma from "../../utils/prisma.js"

interface WarnRow {
  reason: string
  moderatorId: string
  createdAt: Date
}

export default {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warning history for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("member").setDescription("Member to look up").setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const targetUser = interaction.options.getUser("member", true)

    const logs = await prisma.$queryRaw<WarnRow[]>`
      SELECT reason, "moderatorId", "createdAt"
      FROM discord_warn_logs
      WHERE "guildId" = ${interaction.guildId} AND "targetId" = ${targetUser.id}
      ORDER BY "createdAt" DESC
      LIMIT 10
    `

    if (logs.length === 0) {
      await interaction.editReply({ content: `No warnings on record for ${targetUser.tag}.` })
      return
    }

    const fields = logs.map((w, i) => ({
      name: `Warning ${i + 1} — ${new Date(w.createdAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}`,
      value: `${w.reason}\n*By <@${w.moderatorId}>*`,
      inline: false,
    }))

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle(`⚠️ Warning Record — ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(fields)
      .setFooter({ text: `Showing last ${logs.length} warning(s)` })

    await interaction.editReply({ embeds: [embed] })
  },
}
