import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"
import { postModLog } from "../../utils/modlog.js"

const DURATION_OPTIONS = [
  { name: "5 minutes", value: 5 },
  { name: "15 minutes", value: 15 },
  { name: "30 minutes", value: 30 },
  { name: "1 hour", value: 60 },
  { name: "3 hours", value: 180 },
  { name: "12 hours", value: 720 },
  { name: "24 hours", value: 1440 },
  { name: "7 days", value: 10080 },
]

export default {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Impose a vow of silence on a member (Moderator only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("member").setDescription("Member to silence").setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName("duration")
        .setDescription("Duration")
        .setRequired(true)
        .addChoices(...DURATION_OPTIONS.map((d) => ({ name: d.name, value: d.value })))
    )
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const target = interaction.options.getMember("member")
    const durationMins = interaction.options.getInteger("duration", true)
    const reason = interaction.options.getString("reason", true)

    if (!target || !("timeout" in target)) {
      await interaction.editReply({ content: "Member not found in this server." })
      return
    }

    const targetUser = interaction.options.getUser("member", true)
    const durationMs = durationMins * 60 * 1000
    const label = DURATION_OPTIONS.find((d) => d.value === durationMins)?.name ?? `${durationMins}m`

    await target.timeout(durationMs, reason)

    await postModLog(interaction.client, {
      action: "MUTE",
      target: { id: targetUser.id, tag: targetUser.tag },
      moderator: { id: interaction.user.id, tag: interaction.user.tag },
      reason,
      extra: `Duration: ${label}`,
    })

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("🔇 Vow of Silence Imposed")
      .setDescription(
        `<@${targetUser.id}> has been silenced by the Brass Blades for **${label}**.\n\n` + `**Reason:** ${reason}`
      )
      .setFooter({ text: "The silence will lift automatically when the duration expires." })

    await interaction.editReply({ embeds: [embed] })
  },
}
