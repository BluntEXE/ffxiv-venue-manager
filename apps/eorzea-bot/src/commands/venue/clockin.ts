import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { awardGil } from '../../utils/gil.js';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var ${key}`);
  return value;
}

const WEB_APP_URL = requireEnv('WEB_APP_URL');
const API_SECRET = requireEnv('API_SECRET');

interface ClockInResponse {
  ok: boolean;
  code?: 'NOT_LINKED' | 'NO_SHIFT' | 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST';
  alreadyActive?: boolean;
  venueName?: string;
  actualStart?: string | null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('clockin')
    .setDescription('Clock in to your scheduled shift'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const res = await fetch(`${WEB_APP_URL}/api/bot/shifts/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': API_SECRET,
      },
      body: JSON.stringify({ discordId: interaction.user.id }),
    }).catch(() => null);

    if (!res) {
      await interaction.editReply({ content: '⚠️ Could not reach the server. Try again in a moment.' });
      return;
    }

    const data = (await res.json().catch(() => ({ ok: false }))) as ClockInResponse;

    if (!data.ok) {
      const messages: Record<string, string> = {
        NOT_LINKED: '🔗 Your Discord isn\'t linked to a venue manager account. Link it at **[xivvenuemanager.com/dashboard/account](https://xivvenuemanager.com/dashboard/account)**.',
        NO_SHIFT: '📭 Nothing scheduled to start soon. Shifts can be clocked in 30 minutes before through 60 minutes after their scheduled start.',
        FORBIDDEN: '🚫 You don\'t have permission to clock shifts at this venue.',
        CONFLICT: '⚠️ That shift just changed status — try again.',
        BAD_REQUEST: '⚠️ Something went wrong on our end.',
      };
      const message = messages[data.code ?? 'BAD_REQUEST'] ?? messages.BAD_REQUEST;
      await interaction.editReply({ content: message });
      return;
    }

    const fmt = (iso: string | null | undefined) =>
      iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '';

    if (data.alreadyActive) {
      await interaction.editReply({
        content: `✅ You're already clocked in at **${data.venueName}** since ${fmt(data.actualStart)} ST.`,
      });
      return;
    }

    if (interaction.guildId) {
      await awardGil(interaction.user.id, interaction.guildId, 100).catch(() => null);
    }

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle('🟢 Clocked In')
      .setDescription(`You're now clocked in at **${data.venueName}**.`)
      .addFields({ name: 'Started', value: `${fmt(data.actualStart)} ST`, inline: true })
      .setFooter({ text: 'XIV Venue Manager' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
