import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js"

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing env var ${key}`)
  return value
}

const WEB_APP_URL = requireEnv("WEB_APP_URL")
const API_SECRET = requireEnv("API_SECRET")

interface ClockOutResponse {
  ok: boolean
  code?: "NOT_LINKED" | "NO_SHIFT" | "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST"
  venueName?: string
  hoursWorked?: number | null
}

export default {
  data: new SlashCommandBuilder().setName("clockout").setDescription("Clock out of your active shift"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const res = await fetch(`${WEB_APP_URL}/api/bot/shifts/clock-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": API_SECRET,
      },
      body: JSON.stringify({ discordId: interaction.user.id }),
    }).catch(() => null)

    if (!res) {
      await interaction.editReply({ content: "⚠️ Could not reach the server. Try again in a moment." })
      return
    }

    const data = (await res.json().catch(() => ({ ok: false }))) as ClockOutResponse

    if (!data.ok) {
      const messages: Record<string, string> = {
        NOT_LINKED:
          "🔗 Your Discord isn't linked to a venue manager account. Link it at **[xivvenuemanager.com/dashboard/account](https://xivvenuemanager.com/dashboard/account)**.",
        NO_SHIFT: "📭 You're not currently clocked in anywhere.",
        FORBIDDEN: "🚫 You don't have permission to clock shifts at this venue.",
        CONFLICT: "⚠️ That shift just changed status — try again.",
        BAD_REQUEST: "⚠️ Something went wrong on our end.",
      }
      const message = messages[data.code ?? "BAD_REQUEST"] ?? messages.BAD_REQUEST
      await interaction.editReply({ content: message })
      return
    }

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle("🔴 Clocked Out")
      .setDescription(`You're now clocked out of **${data.venueName}**.`)
      .addFields({
        name: "Hours worked",
        value: data.hoursWorked != null ? `${data.hoursWorked}h` : "n/a",
        inline: true,
      })
      .setFooter({ text: "XIV Venue Manager" })
      .setTimestamp()

    await interaction.editReply({ embeds: [embed] })
  },
}
