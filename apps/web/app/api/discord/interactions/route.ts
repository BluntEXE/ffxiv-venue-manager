import { NextRequest, NextResponse } from "next/server"
import nacl from "tweetnacl"
import { handleShiftAccept, handleShiftDecline, handleShiftMaybe } from "@/lib/shift-bot"

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!

function verifyDiscordSignature(req: NextRequest, body: string): boolean {
  const signature = req.headers.get("x-signature-ed25519")
  const timestamp = req.headers.get("x-signature-timestamp")
  if (!signature || !timestamp) return false
  return nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  if (!verifyDiscordSignature(req, body)) {
    return new NextResponse("Invalid signature", { status: 401 })
  }

  const interaction = JSON.parse(body)

  // Discord PING — must respond with PONG for endpoint verification
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 })
  }

  // Button interaction
  if (interaction.type === 3) {
    const customId: string = interaction.data.custom_id
    const discordUserId: string = interaction.member?.user?.id ?? interaction.user?.id
    const discordUsername: string = interaction.member?.user?.username ?? interaction.user?.username

    let result: { content: string }

    if (customId.startsWith("shift_accept:")) {
      const embedId = customId.replace("shift_accept:", "")
      result = await handleShiftAccept(embedId, discordUserId, discordUsername)
    } else if (customId.startsWith("shift_decline:")) {
      const embedId = customId.replace("shift_decline:", "")
      result = await handleShiftDecline(embedId, discordUserId)
    } else if (customId.startsWith("shift_maybe:")) {
      const embedId = customId.replace("shift_maybe:", "")
      result = await handleShiftMaybe(embedId, discordUserId, discordUsername)
    } else {
      result = { content: "Unknown action." }
    }

    // Respond with ephemeral message (only visible to the user who clicked)
    return NextResponse.json({
      type: 4,
      data: {
        content: result.content,
        flags: 64, // EPHEMERAL
      },
    })
  }

  return NextResponse.json({ type: 1 })
}
