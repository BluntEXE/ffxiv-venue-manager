import { Client, EmbedBuilder, TextChannel } from 'discord.js';

const XIV_BLUE = 0x00b4ff;
const DANGER = 0xe74c3c;
const WARN_COLOR = 0xf39c12;

export type ModAction = 'WARN' | 'MUTE' | 'KICK' | 'BAN' | 'UNMUTE';

const ACTION_LABEL: Record<ModAction, string> = {
  WARN: '⚠️ Warning Issued',
  MUTE: '🔇 Silence Imposed',
  KICK: '👢 Expelled from Realm',
  BAN: '⛔ Banished',
  UNMUTE: '🔊 Silence Lifted',
};

const ACTION_COLOR: Record<ModAction, number> = {
  WARN: WARN_COLOR,
  MUTE: WARN_COLOR,
  KICK: DANGER,
  BAN: DANGER,
  UNMUTE: XIV_BLUE,
};

export async function postModLog(
  client: Client,
  opts: {
    action: ModAction;
    target: { id: string; tag: string };
    moderator: { id: string; tag: string };
    reason: string;
    extra?: string;
  }
) {
  const logChannelId = process.env.MOD_LOG_CHANNEL_ID;
  if (!logChannelId) return;

  const channel = client.channels.cache.get(logChannelId) ?? await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) return;

  const embed = new EmbedBuilder()
    .setColor(ACTION_COLOR[opts.action])
    .setTitle(ACTION_LABEL[opts.action])
    .addFields(
      { name: 'Member', value: `<@${opts.target.id}> (${opts.target.tag})`, inline: true },
      { name: 'Moderator', value: `<@${opts.moderator.id}>`, inline: true },
      { name: 'Reason', value: opts.reason },
    )
    .setTimestamp();

  if (opts.extra) embed.addFields({ name: 'Details', value: opts.extra });

  await channel.send({ embeds: [embed] });
}
