import { readdirSync } from "fs"
import { join } from "path"
import { Collection } from "discord.js"
import { BotClient, Command } from "../types/index.js"

export async function loadCommands(client: BotClient) {
  client.commands = new Collection()

  const foldersPath = join(import.meta.dirname, "..", "commands")
  const folders = readdirSync(foldersPath)

  for (const folder of folders) {
    const commandsPath = join(foldersPath, folder)
    let stat
    try {
      stat = readdirSync(commandsPath)
    } catch {
      continue
    }
    const files = stat.filter((f: string) => f.endsWith(".js") || f.endsWith(".ts"))

    for (const file of files) {
      const filePath = join(commandsPath, file)
      try {
        const command = (await import(filePath)).default as Command | undefined
        if (command?.data) {
          client.commands.set(command.data.name, command)
          console.log(`[Commands] Loaded /${command.data.name}`)
        }
      } catch (err) {
        console.error(`[Commands] Failed to load ${file}:`, err)
      }
    }
  }
}
