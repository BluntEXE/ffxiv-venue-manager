import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the Aetheryte network is responding'),

  async execute(interaction: ChatInputCommandInteraction) {
    const latency = Date.now() - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle('⚡ Aetheryte Network Status')
      .addFields(
        { name: 'Roundtrip', value: `${latency}ms`, inline: true },
        { name: 'WebSocket', value: `${wsLatency}ms`, inline: true },
      )
      .setFooter({ text: 'The Aetheryte pulses with life.' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
