import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"
import { postModLog } from "../../utils/modlog.js"

export default {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName("userid").setDescription("Discord user ID to unban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for unban")),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const userId = interaction.options.getString("userid", true).trim()
    const reason = interaction.options.getString("reason") ?? "No reason provided"

    // Validate ID is numeric
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.editReply({ content: "Invalid user ID - must be a Discord snowflake." })
      return
    }

    try {
      const ban = await interaction.guild!.bans.fetch(userId).catch(() => null)
      if (!ban) {
        await interaction.editReply({ content: "That user is not currently banned." })
        return
      }

      await interaction.guild!.members.unban(userId, reason)

      await postModLog(interaction.client, {
        action: "UNMUTE", // reuse blue colour
        target: ban.user,
        moderator: interaction.user,
        reason,
      })

      await interaction.editReply({ content: `**${ban.user.tag}** has been unbanned.` })
    } catch {
      await interaction.editReply({ content: "Failed to unban — check the ID and my permissions." })
    }
  },
}
