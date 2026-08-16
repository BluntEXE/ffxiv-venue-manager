import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"
import { postModLog } from "../../utils/modlog.js"

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expel a member from the realm (Moderator only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName("member").setDescription("Member to expel").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for expulsion").setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const target = interaction.options.getMember("member")
    const reason = interaction.options.getString("reason", true)

    if (!target || !("kick" in target)) {
      await interaction.editReply({ content: "Member not found in this server." })
      return
    }

    const targetUser = interaction.options.getUser("member", true)

    await target.kick(reason)

    await postModLog(interaction.client, {
      action: "KICK",
      target: { id: targetUser.id, tag: targetUser.tag },
      moderator: { id: interaction.user.id, tag: interaction.user.tag },
      reason,
    })

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("👢 Member Expelled")
      .setDescription(`**${targetUser.tag}** has been cast out by the Brass Blades.\n\n` + `**Reason:** ${reason}`)
      .setFooter({ text: "They may return if invited again." })

    await interaction.editReply({ embeds: [embed] })
  },
}
