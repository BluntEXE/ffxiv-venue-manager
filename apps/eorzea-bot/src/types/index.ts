import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Client,
  Collection,
} from "discord.js"

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>
}

export interface BotClient extends Client {
  commands: Collection<string, Command>
}
