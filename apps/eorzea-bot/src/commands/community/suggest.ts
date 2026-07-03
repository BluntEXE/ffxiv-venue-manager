import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { awardGil } from '../../utils/gil.js';

export default {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion to the community')
    .addStringOption(o =>
      o.setName('suggestion').setDescription('Your suggestion').setRequired(true).setMaxLength(1000)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channelId = process.env.SUGGESTIONS_CHANNEL_ID;
    if (!channelId) {
      await interaction.editReply({ content: 'Suggestions channel not configured.' });
      return;
    }

    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel?.isTextBased()) {
      await interaction.editReply({ content: 'Suggestions channel not found.' });
      return;
    }

    const text = interaction.options.getString('suggestion', true);
    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    const displayName = member?.displayName ?? interaction.user.username;

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle('💡 New Suggestion')
      .setDescription(text)
      .setAuthor({ name: displayName, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp()
      .setFooter({ text: 'React below to vote' });

    const msg = await channel.send({ embeds: [embed] });
    await msg.react('👍');
    await msg.react('👎');

    if (interaction.guildId) {
      await awardGil(interaction.user.id, interaction.guildId, 50).catch(() => null);
    }

    await interaction.editReply({ content: 'Your suggestion has been submitted!' });
  },
};
