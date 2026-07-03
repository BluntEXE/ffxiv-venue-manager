import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { buyXpBoost, buyCooldownSkip, XP_BOOST_COST, COOLDOWN_SKIP_COST } from '../../utils/gil.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gil')
    .setDescription('Spend your Gil')
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('See what you can buy with Gil')
    )
    .addSubcommand(sub =>
      sub.setName('buy')
        .setDescription('Buy a perk with Gil')
        .addStringOption(o =>
          o.setName('perk')
            .setDescription('Which perk to buy')
            .setRequired(true)
            .addChoices(
              { name: `XP Boost (${XP_BOOST_COST} Gil): 2x XP for 1 hour`, value: 'xp_boost' },
              { name: `Cooldown Skip (${COOLDOWN_SKIP_COST} Gil): bypass one chat-XP cooldown`, value: 'cooldown_skip' },
            )
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'shop') {
      const embed = new EmbedBuilder()
        .setColor(0x00b4ff)
        .setTitle('🛒 Gil Shop')
        .addFields(
          { name: `XP Boost — ${XP_BOOST_COST} Gil`, value: '2x XP for 1 hour. Buying while one is active extends the timer.', inline: false },
          { name: `Cooldown Skip — ${COOLDOWN_SKIP_COST} Gil`, value: 'Bypasses one chat-XP cooldown. Skips stack, no cap.', inline: false },
        )
        .setFooter({ text: 'Use /gil buy <perk> to purchase' });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // sub === 'buy'
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const perk = interaction.options.getString('perk', true);

    if (perk === 'xp_boost') {
      const bought = await buyXpBoost(interaction.user.id);
      await interaction.editReply({
        content: bought
          ? `✨ XP Boost purchased! 2x XP for the next hour.`
          : `⚠️ Not enough Gil: XP Boost costs ${XP_BOOST_COST} Gil.`,
      });
      return;
    }

    if (perk === 'cooldown_skip') {
      const bought = await buyCooldownSkip(interaction.user.id);
      await interaction.editReply({
        content: bought
          ? `✨ Cooldown Skip purchased! Your next message will earn XP even on cooldown.`
          : `⚠️ Not enough Gil: Cooldown Skip costs ${COOLDOWN_SKIP_COST} Gil.`,
      });
      return;
    }

    await interaction.editReply({ content: 'Unknown perk.' });
  },
};
