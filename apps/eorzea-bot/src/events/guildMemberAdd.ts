import { GuildMember, EmbedBuilder, TextChannel } from "discord.js"
import { assignMember } from "../utils/membership.js"

const BOT_COMMANDS_CHANNEL_ID = "1522189820989014196"

const GC_MAP: Record<string, { name: string; emoji: string }> = {
  Maelstrom: { name: "Maelstrom", emoji: "⚔️" },
  "Twin Adder": { name: "Order of the Twin Adder", emoji: "🌿" },
  "Immortal Flames": { name: "Immortal Flames", emoji: "🔥" },
}

function detectGc(member: GuildMember): { name: string; emoji: string } | null {
  for (const [roleName, gc] of Object.entries(GC_MAP)) {
    if (member.roles.cache.some((r) => r.name === roleName)) return gc
  }
  return null
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export default {
  name: "guildMemberAdd",
  once: false,
  async execute(member: GuildMember) {
    // Replay guard
    if (Date.now() - (member.joinedTimestamp ?? 0) > 10_000) return

    // Platform-aware role + nickname
    await assignMember(member).catch((err) =>
      console.error(`[Gatekeep] assignMember failed for ${member.user.username}:`, err)
    )

    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID
    if (!welcomeChannelId) return
    const channel = member.guild.channels.cache.get(welcomeChannelId) as TextChannel | undefined
    if (!channel?.isTextBased()) return

    const gc = detectGc(member)
    const gcLine = gc
      ? `You're the ${ordinal(member.guild.memberCount)} member of the realm — and a proud member of the **${gc.name}**. ${gc.emoji}\n\n`
      : `You're the **${ordinal(member.guild.memberCount)}** member of the realm.\n\n`

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTitle("A new adventurer has arrived!")
      .setDescription(`Welcome, ${member}!\n\n${gcLine}`)
      .addFields({
        name: "Get Started",
        value:
          "🌐 Link your account at **[xivvenuemanager.com](https://xivvenuemanager.com)**\n" +
          `⚡ Check <#${BOT_COMMANDS_CHANNEL_ID}> to earn XP & climb the ranks\n` +
          "🔄 Run `/sync` if you're venue staff or an owner",
      })
      .setFooter({ text: "XIV Venue Manager Community" })
      .setTimestamp()

    await channel.send({ embeds: [embed] })
  },
}
