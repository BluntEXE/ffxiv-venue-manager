import { Client, ActivityType } from "discord.js"

export default {
  name: "clientReady",
  once: true,
  execute(client: Client) {
    console.log(`[Bot] Logged in as ${client.user?.tag}`)
    client.user?.setActivity("the Aetheryte", { type: ActivityType.Watching })
  },
}
