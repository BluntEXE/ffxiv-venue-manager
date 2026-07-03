import { MessageReaction, PartialMessageReaction, User, PartialUser, Client } from 'discord.js';
import prisma from '../utils/prisma.js';
import { awardGil } from '../utils/gil.js';

const REACTION_GIL_AMOUNT = 25;

export default {
  name: 'messageReactionAdd',
  once: false,
  async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, client: Client) {
    if (user.bot) return;

    const tonightChannelId = process.env.TONIGHT_CHANNEL_ID;
    const eventsChannelId = process.env.EVENTS_FEED_CHANNEL_ID;
    const channelId = reaction.message.channelId;
    if (channelId !== tonightChannelId && channelId !== eventsChannelId) return;

    if (reaction.partial) {
      await reaction.fetch().catch(() => null);
    }
    const message = reaction.message.partial
      ? await reaction.message.fetch().catch(() => null)
      : reaction.message;
    if (!message) return;
    if (message.author?.id !== client.user?.id) return; // only our own bot-posted embeds pay out

    const guildId = message.guildId;
    if (!guildId) return;

    try {
      await prisma.gilReactionReward.create({
        data: { discordId: user.id, messageId: message.id },
      });
    } catch (err) {
      const isUniqueViolation = (err as { code?: string }).code === 'P2002';
      if (!isUniqueViolation) console.error('[Gil] Reaction reward insert failed:', err);
      return; // already rewarded for this message (or a real error — either way, no double-pay)
    }

    try {
      await awardGil(user.id, guildId, REACTION_GIL_AMOUNT);
    } catch (err) {
      // Payout failed after the dedup marker committed — roll the marker back
      // so the user isn't permanently barred from earning for this message,
      // and so this doesn't surface as an unhandled rejection that crashes
      // the bot process (the caller in eventHandler.ts doesn't catch).
      console.error('[Gil] Award failed after reward marker was created, rolling back marker:', err);
      await prisma.gilReactionReward
        .delete({ where: { discordId_messageId: { discordId: user.id, messageId: message.id } } })
        .catch(() => null);
    }
  },
};
