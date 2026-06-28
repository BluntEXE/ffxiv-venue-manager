import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js"
import { assignMember } from "./assign.js"
import { getAllDiscordIds } from "./db.js"

const GUILD_ID = process.env.DISCORD_GUILD_ID!
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const APP_ID = process.env.DISCORD_APPLICATION_ID!

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
})

async function registerCommands() {
  const rest = new REST().setToken(BOT_TOKEN)
  const commands = [
    new SlashCommandBuilder()
      .setName("sync")
      .setDescription("Sync Discord roles and nicknames for all XIV Venue Manager members")
      .setDefaultMemberPermissions("0") // admin only
      .toJSON(),
  ]
  await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), { body: commands })
  console.log("Slash commands registered")
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user!.tag}`)
  await registerCommands()
})

client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== GUILD_ID) return
  try {
    const result = await assignMember(member as GuildMember)
    console.log(`[join] ${result}`)
  } catch (err) {
    console.error(`[join] Failed for ${member.user.username}:`, err)
  }
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "sync") return
  if (interaction.guildId !== GUILD_ID) return

  await interaction.deferReply({ ephemeral: true })

  try {
    const guild = interaction.guild!
    await guild.members.fetch()

    const knownIds = new Set(await getAllDiscordIds())
    const results: string[] = []

    for (const [, member] of guild.members.cache) {
      if (member.user.bot) continue
      // Only process members who have an XIV VM account or need Community Member
      try {
        const result = await assignMember(member)
        results.push(result)
      } catch (err) {
        results.push(`${member.user.username}: error - ${err}`)
      }
    }

    const summary = `Synced ${results.length} members.`
    console.log(`[sync] ${summary}\n${results.join("\n")}`)

    await (interaction as ChatInputCommandInteraction).editReply(
      `${summary}\n\`\`\`\n${results.slice(0, 20).join("\n")}${results.length > 20 ? `\n...and ${results.length - 20} more` : ""}\n\`\`\``
    )
  } catch (err) {
    console.error("[sync] Error:", err)
    await (interaction as ChatInputCommandInteraction).editReply("Sync failed - check bot logs.")
  }
})

client.login(BOT_TOKEN)
