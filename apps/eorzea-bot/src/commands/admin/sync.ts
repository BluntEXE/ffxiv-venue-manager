import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { assignMember } from '../../utils/membership.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Sync your XIV Venue Manager roles based on your linked account'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = interaction.guild?.members.cache.get(interaction.user.id)
      ?? await interaction.guild?.members.fetch(interaction.user.id);

    if (!member) {
      await interaction.editReply({ content: 'Could not find your member record.' });
      return;
    }

    const result = await assignMember(member);
    console.log(`[sync] ${result}`);

    const linked = !result.includes('no account');

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle('⚔️ Role Sync Complete')
      .setDescription(
        linked
          ? `Roles and nickname updated based on your XIV Venue Manager account.`
          : `No linked XIV Venue Manager account found.\nSign up at **[xivvenuemanager.com](https://xivvenuemanager.com)** and link your Discord to unlock your roles.`
      )
      .setFooter({ text: linked ? result : 'Community Member role assigned' });

    await interaction.editReply({ embeds: [embed] });
  },
};
