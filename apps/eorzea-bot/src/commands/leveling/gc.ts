import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  Role,
} from 'discord.js';
import prisma from '../../utils/prisma.js';
import { rankForXp, levelFromXp, GC_LABELS, GC_EMOJI, type GrandCompany } from '../../utils/xp.js';

const GC_CHOICES = [
  { name: '🌊 Maelstrom', value: 'MAELSTROM' },
  { name: '🐍 Order of the Twin Adder', value: 'TWIN_ADDER' },
  { name: '🔥 Immortal Flames', value: 'IMMORTAL_FLAMES' },
] as const;

// Env var names for GC Discord role IDs
const GC_ROLE_ENV: Record<GrandCompany, string> = {
  MAELSTROM: 'GC_ROLE_MAELSTROM',
  TWIN_ADDER: 'GC_ROLE_TWIN_ADDER',
  IMMORTAL_FLAMES: 'GC_ROLE_IMMORTAL_FLAMES',
};

const ALL_GCS: GrandCompany[] = ['MAELSTROM', 'TWIN_ADDER', 'IMMORTAL_FLAMES'];

export default {
  data: new SlashCommandBuilder()
    .setName('gc')
    .setDescription('Grand Company — join a company or check your standing')
    .addSubcommand(sub =>
      sub.setName('join')
        .setDescription('Enlist in a Grand Company (one-time choice)')
        .addStringOption(o =>
          o.setName('company').setDescription('Which Grand Company to join').setRequired(true)
            .addChoices(...GC_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('View your Grand Company rank and standing')
        .addUserOption(o => o.setName('member').setDescription('Member to look up (defaults to you)'))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'join') {
      await handleJoin(interaction);
    } else {
      await handleInfo(interaction);
    }
  },
};

async function handleJoin(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const chosen = interaction.options.getString('company', true) as GrandCompany;

  // Check if already enlisted
  const existing = await prisma.$queryRaw<{ gc: string | null }[]>`
    SELECT gc FROM discord_members WHERE "discordId" = ${interaction.user.id}
  `;

  if (existing[0]?.gc) {
    const current = existing[0].gc as GrandCompany;
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Already Enlisted')
        .setDescription(
          `You are already a member of the **${GC_LABELS[current]}** ${GC_EMOJI[current]}.\n\n` +
          `Grand Company allegiance cannot be changed once sworn.`
        )],
    });
    return;
  }

  // Write GC choice
  await prisma.$executeRaw`
    INSERT INTO discord_members ("discordId", "guildId", gc, xp, level)
    VALUES (${interaction.user.id}, ${interaction.guildId}, ${chosen}, 0, 1)
    ON CONFLICT ("discordId") DO UPDATE SET gc = ${chosen}, "updatedAt" = NOW()
  `;

  // Assign GC Discord role if configured
  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  if (member && interaction.guild) {
    // Strip other GC roles first
    for (const gc of ALL_GCS) {
      const roleId = process.env[GC_ROLE_ENV[gc]];
      if (roleId) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role && member.roles.cache.has(roleId)) {
          await member.roles.remove(role).catch(() => null);
        }
      }
    }
    // Add chosen GC role
    const newRoleId = process.env[GC_ROLE_ENV[chosen]];
    if (newRoleId) {
      const role = interaction.guild.roles.cache.get(newRoleId);
      if (role) await member.roles.add(role).catch(() => null);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x00b4ff)
    .setTitle(`${GC_EMOJI[chosen]} Allegiance Sworn`)
    .setDescription(
      `You have enlisted with the **${GC_LABELS[chosen]}**.\n\n` +
      `Earn XP by chatting to rise through the ranks. Use **/rank** to track your progress and **/gc info** to see your company standing.`
    )
    .setFooter({ text: 'Your allegiance is permanent. Choose your battles wisely.' });

  await interaction.editReply({ embeds: [embed] });
}

async function handleInfo(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('member') ?? interaction.user;

  const rows = await prisma.$queryRaw<{ xp: string; level: string; gc: string | null }[]>`
    SELECT xp::text, level::text, gc FROM discord_members WHERE "discordId" = ${target.id}
  `;

  const data = rows[0];
  if (!data?.gc) {
    await interaction.editReply({
      content: target.id === interaction.user.id
        ? 'You haven\'t enlisted yet. Use **/gc join** to choose your Grand Company.'
        : `${target.username} hasn't enlisted in a Grand Company yet.`,
    });
    return;
  }

  const gc    = data.gc as GrandCompany;
  const xp    = parseInt(data.xp, 10);
  const level = parseInt(data.level, 10);
  const rank  = rankForXp(xp, gc);

  // Position within own GC
  const posRows = await prisma.$queryRaw<{ pos: string; total: string }[]>`
    SELECT
      (SELECT COUNT(*) + 1 FROM discord_members WHERE gc = ${gc} AND xp > ${xp})::text AS pos,
      (SELECT COUNT(*) FROM discord_members WHERE gc = ${gc})::text AS total
  `;
  const pos = parseInt(posRows[0]?.pos ?? '1', 10);
  const total = parseInt(posRows[0]?.total ?? '1', 10);

  const embed = new EmbedBuilder()
    .setColor(0x00b4ff)
    .setAuthor({ name: target.displayName ?? target.username, iconURL: target.displayAvatarURL() })
    .setTitle(`${GC_EMOJI[gc]} ${GC_LABELS[gc]}`)
    .setDescription(`**${rank.name}** · Level ${level}`)
    .addFields(
      { name: '📊 XP', value: xp.toLocaleString(), inline: true },
      { name: '🏅 Company Rank', value: `#${pos} of ${total}`, inline: true },
    )
    .setFooter({ text: 'Use /rank for full XP breakdown' });

  await interaction.editReply({ embeds: [embed] });
}
