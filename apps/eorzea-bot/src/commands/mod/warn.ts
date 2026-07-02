import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import prisma from '../../utils/prisma.js';
import { postModLog } from '../../utils/modlog.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue an official warning to a member (Moderator only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason', true);

    if (!target || typeof target === 'string') {
      await interaction.editReply({ content: 'Member not found in this server.' });
      return;
    }

    const targetUser = interaction.options.getUser('member', true);

    // Upsert member record + increment warn count
    await prisma.$executeRaw`
      INSERT INTO discord_members ("discordId", "guildId", warns)
      VALUES (${targetUser.id}, ${interaction.guildId}, 1)
      ON CONFLICT ("discordId") DO UPDATE SET warns = discord_members.warns + 1, "updatedAt" = NOW()
    `;

    // Log the warn
    await prisma.$executeRaw`
      INSERT INTO discord_warn_logs ("guildId", "targetId", "moderatorId", reason)
      VALUES (${interaction.guildId}, ${targetUser.id}, ${interaction.user.id}, ${reason})
    `;

    // Get updated warn count
    const rows = await prisma.$queryRaw<{ warns: number }[]>`
      SELECT warns FROM discord_members WHERE "discordId" = ${targetUser.id}
    `;
    const totalWarns = rows[0]?.warns ?? 1;

    await postModLog(interaction.client, {
      action: 'WARN',
      target: { id: targetUser.id, tag: targetUser.tag },
      moderator: { id: interaction.user.id, tag: interaction.user.tag },
      reason,
      extra: `Total warnings: ${totalWarns}`,
    });

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('⚠️ Warning Issued')
      .setDescription(
        `<@${targetUser.id}> has received an official warning from the Brass Blades.\n\n` +
        `**Reason:** ${reason}\n` +
        `**Total warnings:** ${totalWarns}`
      )
      .setFooter({ text: 'Further infractions may result in removal from the realm.' });

    await interaction.editReply({ embeds: [embed] });
  },
};
