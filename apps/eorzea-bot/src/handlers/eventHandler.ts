import { readdirSync } from "fs"
import { join } from "path"
import { BotClient } from "../types/index.js"

export async function loadEvents(client: BotClient) {
  const eventsPath = join(import.meta.dirname, "..", "events")
  const files = readdirSync(eventsPath).filter((f) => f.endsWith(".js") || f.endsWith(".ts"))

  for (const file of files) {
    const filePath = join(eventsPath, file)
    const event = await import(filePath)
    const { name, once, execute } = event.default

    if (once) {
      client.once(name, (...args) => execute(...args, client))
    } else {
      client.on(name, (...args) => execute(...args, client))
    }

    console.log(`[Events] Loaded ${name}`)
  }
}
