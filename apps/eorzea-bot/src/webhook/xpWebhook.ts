import { Client } from 'discord.js';
import prisma from '../utils/prisma.js';
import { rankForXp, type GrandCompany } from '../utils/xp.js';

export async function awardXp(client: Client, discordId: string, amount: number, reason: string): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<{ old_xp: string; new_xp: string; gc: string | null }[]>`
      WITH updated AS (
        INSERT INTO discord_members ("discordId", "guildId", xp, level)
        VALUES (${discordId}, ${process.env.GUILD_ID}, ${amount}, 1)
        ON CONFLICT ("discordId") DO UPDATE
          SET xp = discord_members.xp + ${amount},
              "updatedAt" = NOW()
        RETURNING xp, (xp - ${amount}) AS old_xp, gc
      )
      SELECT old_xp::text, xp::text AS new_xp, gc FROM updated
    `;

    if (!rows[0]) return;

    const oldXp = parseInt(rows[0].old_xp, 10);
    const newXp = parseInt(rows[0].new_xp, 10);
    const gc    = (rows[0].gc as GrandCompany | null) ?? null;

    const oldRank = rankForXp(oldXp, gc);
    const newRank = rankForXp(newXp, gc);

    if (newRank.index > oldRank.index) {
      const user = await client.users.fetch(discordId).catch(() => null);
      if (user) {
        await user.send({
          embeds: [{
            color: 0x00b4ff,
            title: `${newRank.emoji} Rank Up!`,
            description:
              `You've been promoted to:\n### ${newRank.name}`,
            footer: { text: 'XIV Venue Manager Community · /rank to see your progress' },
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => null);
      }
    }
  } catch (err) {
    console.error(`[XP] Failed to award ${amount} XP to ${discordId}:`, err);
  }
}
