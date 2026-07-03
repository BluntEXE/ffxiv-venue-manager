import { Client, EmbedBuilder } from 'discord.js';
import prisma from './prisma.js';

export async function postEmbed(client: Client, channelId: string, embed: EmbedBuilder): Promise<void> {
  const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    console.warn(`[post] Channel ${channelId} not found or not a text channel`);
    return;
  }
  await channel.send({ embeds: [embed] });
  console.log(`[post] Sent embed to #${channel.name}`);
}

export async function postOrEditEmbed(
  client: Client,
  key: string,
  channelId: string,
  embed: EmbedBuilder
): Promise<void> {
  const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    console.warn(`[postOrEdit] Channel ${channelId} not found or not a text channel`);
    return;
  }

  const tracked = await prisma.trackedMessage.findUnique({ where: { key } });

  if (tracked) {
    const existing = await channel.messages.fetch(tracked.messageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] });
      console.log(`[postOrEdit] Edited ${key} in #${channel.name}`);
      return;
    }
    console.warn(`[postOrEdit] Tracked message for ${key} missing (deleted?) — reposting`);
  }

  const sent = await channel.send({ embeds: [embed] });
  await prisma.trackedMessage.upsert({
    where: { key },
    create: { key, channelId, messageId: sent.id },
    update: { channelId, messageId: sent.id },
  });
  console.log(`[postOrEdit] Posted fresh ${key} to #${channel.name}`);
}
