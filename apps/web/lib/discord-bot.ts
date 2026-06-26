const DISCORD_API = "https://discord.com/api/v10"
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!

export interface DiscordButtonComponent {
  type: 2
  style: 1 | 2 | 3 | 4  // 1=Primary(blue) 2=Secondary 3=Success(green) 4=Danger(red)
  label: string
  custom_id: string
  disabled?: boolean
}

export interface DiscordActionRow {
  type: 1
  components: DiscordButtonComponent[]
}

export interface BotMessagePayload {
  content?: string
  embeds?: object[]
  components?: DiscordActionRow[]
}

async function botFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Discord API ${path} → ${res.status}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

export async function postBotMessage(channelId: string, payload: BotMessagePayload): Promise<string> {
  const msg = await botFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return msg.id as string
}

export async function editBotMessage(channelId: string, messageId: string, payload: BotMessagePayload): Promise<void> {
  await botFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function deleteBotMessage(channelId: string, messageId: string): Promise<void> {
  await botFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
  })
}
