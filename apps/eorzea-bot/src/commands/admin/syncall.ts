import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"
import { assignMember } from "../../utils/membership.js"

export default {
  data: new SlashCommandBuilder()
    .setName("syncall")
    .setDescription("Sync roles and nicknames for all server members (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const guild = interaction.guild!
    await guild.members.fetch()

    const results: string[] = []
    for (const [, member] of guild.members.cache) {
      if (member.user.bot) continue
      const result = await assignMember(member).catch((e) => `${member.user.username}: error - ${e.message}`)
      results.push(result)
    }

    console.log(`[syncall] Synced ${results.length} members:\n${results.join("\n")}`)

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle("⚔️ Server Sync Complete")
      .setDescription(
        `Synced **${results.length}** members.\n\`\`\`\n` +
          results.slice(0, 20).join("\n") +
          (results.length > 20 ? `\n…and ${results.length - 20} more` : "") +
          "\n\`\`\`"
      )

    await interaction.editReply({ embeds: [embed] })
  },
}
