import { Client, EmbedBuilder, TextChannel } from 'discord.js';

export async function postEmbed(client: Client, channelId: string, embed: EmbedBuilder): Promise<void> {
  const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) {
    console.warn(`[post] Channel ${channelId} not found or not a text channel`);
    return;
  }
  await channel.send({ embeds: [embed] });
  console.log(`[post] Sent embed to #${channel.name}`);
}
