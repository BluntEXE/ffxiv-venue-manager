import { Message, GuildMember } from 'discord.js';
import prisma from '../utils/prisma.js';
import { MESSAGE_XP, rankForXp, type GrandCompany } from '../utils/xp.js';
import { hasActiveXpBoost, consumeCooldownSkip } from '../utils/gil.js';

function detectGcFromRoles(member: GuildMember): GrandCompany | null {
  const map: [string | undefined, GrandCompany][] = [
    [process.env.GC_ROLE_MAELSTROM,      'MAELSTROM'],
    [process.env.GC_ROLE_TWIN_ADDER,     'TWIN_ADDER'],
    [process.env.GC_ROLE_IMMORTAL_FLAMES,'IMMORTAL_FLAMES'],
  ];
  for (const [roleId, gc] of map) {
    if (roleId && member.roles.cache.has(roleId)) return gc;
  }
  return null;
}

const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 60_000;

export default {
  name: 'messageCreate',
  once: false,
  async execute(message: Message) {
    if (message.author.bot || !message.guildId) return;

    const now = Date.now();
    const last = cooldowns.get(message.author.id) ?? 0;
    if (now - last < COOLDOWN_MS) {
      const skipped = await consumeCooldownSkip(message.author.id);
      if (!skipped) return;
    }
    cooldowns.set(message.author.id, now);

    let earned = MESSAGE_XP;
    if (await hasActiveXpBoost(message.author.id)) {
      earned *= 2;
    }

    try {
      const rows = await prisma.$queryRaw<{ old_xp: string; new_xp: string; gc: string | null }[]>`
        WITH updated AS (
          INSERT INTO discord_members ("discordId", "guildId", xp, level)
          VALUES (${message.author.id}, ${message.guildId}, ${earned}, 1)
          ON CONFLICT ("discordId") DO UPDATE
            SET xp = discord_members.xp + ${earned},
                "updatedAt" = NOW()
          RETURNING xp, (xp - ${earned}) AS old_xp, gc
        )
        SELECT old_xp::text, xp::text AS new_xp, gc FROM updated
      `;

      if (!rows[0]) return;

      const oldXp = parseInt(rows[0].old_xp, 10);
      const newXp = parseInt(rows[0].new_xp, 10);
      let gc      = (rows[0].gc as GrandCompany | null) ?? null;

      // Backfill GC from onboarding role if not yet recorded
      if (!gc && message.member) {
        const detected = detectGcFromRoles(message.member);
        if (detected) {
          await prisma.$executeRaw`
            UPDATE discord_members SET gc = ${detected} WHERE "discordId" = ${message.author.id} AND gc IS NULL
          `;
          gc = detected;
        }
      }

      const oldRank = rankForXp(oldXp, gc);
      const newRank = rankForXp(newXp, gc);

      if (newRank.index > oldRank.index) {
        await message.author.send({
          embeds: [{
            color: 0x00b4ff,
            title: `${newRank.emoji} Rank Up!`,
            description:
              `Congratulations, **${message.author.displayName ?? message.author.username}**!\n\n` +
              `You've been promoted to:\n### ${newRank.name}`,
            footer: { text: 'XIV Venue Manager Community · /rank to see your progress' },
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => null);
      }
    } catch (err) {
      console.error('[XP] Error awarding XP:', err);
    }
  },
};
