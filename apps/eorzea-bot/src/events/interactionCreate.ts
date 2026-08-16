import { Interaction } from "discord.js"
import { BotClient } from "../types/index.js"

export default {
  name: "interactionCreate",
  once: false,
  async execute(interaction: Interaction, client: BotClient) {
    if (!interaction.isChatInputCommand()) return

    const command = client.commands.get(interaction.commandName)
    if (!command) return

    try {
      await command.execute(interaction)
    } catch (err) {
      console.error(`[Error] /${interaction.commandName}:`, err)
      const msg = {
        content: "The aether surrounding this command is unstable. Please try again.",
        ephemeral: true,
      }
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg)
        } else {
          await interaction.reply(msg)
        }
      } catch {
        // interaction expired - nothing to do
      }
    }
  },
}
