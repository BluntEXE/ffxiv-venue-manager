import { GuildMember, EmbedBuilder, TextChannel } from 'discord.js';
import { assignMember } from '../utils/membership.js';

export default {
  name: 'guildMemberAdd',
  once: false,
  async execute(member: GuildMember) {
    // Replay guard
    if (Date.now() - (member.joinedTimestamp ?? 0) > 10_000) return;

    // Platform-aware role + nickname
    await assignMember(member).catch(err =>
      console.error(`[Gatekeep] assignMember failed for ${member.user.username}:`, err)
    );

    // Welcome embed
    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
    if (!welcomeChannelId) return;
    const channel = member.guild.channels.cache.get(welcomeChannelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTitle('A new adventurer has arrived!')
      .setDescription(
        `Glad you're here, ${member}.\n\n` +
        `You are the **${ordinal(member.guild.memberCount)}** member of the realm.`
      )
      .addFields(
        {
          name: '🌐 Get started',
          value:
            '• Sign up at **[xivvenuemanager.com](https://xivvenuemanager.com)** to manage or discover venues\n' +
            '• Install the **Dalamud plugin** to log visits in-game\n' +
            `• Use </sync:0> after linking your account to unlock your roles`,
        }
      )
      .setFooter({ text: 'XIV Venue Manager Community' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  },
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
