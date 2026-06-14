import { NextRequest, NextResponse } from "next/server"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const SHOUT_ORIGIN = "https://shout.xivvenuemanager.com"

const STRING_FIELDS = ["venueName", "tagline", "server", "location", "openTime", "djs", "links"] as const

interface ExtractedFields {
  venueName?: string
  tagline?: string
  server?: string
  location?: string
  openTime?: string
  djs?: string
  links?: string
  isAdult?: boolean
}

const SYSTEM_PROMPT = `You extract FFXIV venue event details from a pasted Discord post.
Return ONLY a JSON object (no markdown, no commentary) with any of these keys you can confidently determine:
- venueName: the venue or location hosting the event
- tagline: the event name or vibe/theme
- server: the FFXIV data center and/or world (e.g. "Crystal Mateus")
- location: in-game housing location as "W<ward> P<plot>"
- openTime: opening time range in Server Time as "HH:MM-HH:MM ST"
- djs: comma-separated list of DJ or performer names
- links: relevant Discord/Partake/etc URLs separated by " | "
- isAdult: true if the post indicates 18+/NSFW/adult content, otherwise omit

Omit any key you cannot determine. Do not include any text outside the JSON object.`

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", SHOUT_ORIGIN)
  res.headers.set("Access-Control-Allow-Credentials", "true")
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

function sanitizeFields(raw: unknown): ExtractedFields {
  const result: ExtractedFields = {}
  if (typeof raw !== "object" || raw === null) return result
  const obj = raw as Record<string, unknown>
  for (const field of STRING_FIELDS) {
    const value = obj[field]
    if (typeof value === "string" && value.trim()) result[field] = value.trim()
  }
  if (typeof obj.isAdult === "boolean") result.isAdult = obj.isAdult
  return result
}

async function handler(req: NextRequest): Promise<NextResponse> {
  let text = ""
  try {
    const body = await req.json()
    if (typeof body?.text === "string") text = body.text
  } catch {
    return cors(NextResponse.json({}, { status: 200 }))
  }
  if (!text.trim()) return cors(NextResponse.json({}, { status: 200 }))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(`${process.env.HERMES_LITELLM_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HERMES_LITELLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemma-3-12b-it:free",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) return cors(NextResponse.json({}, { status: 200 }))

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== "string") return cors(NextResponse.json({}, { status: 200 }))

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return cors(NextResponse.json({}, { status: 200 }))

    const parsed = JSON.parse(jsonMatch[0])
    return cors(NextResponse.json(sanitizeFields(parsed), { status: 200 }))
  } catch {
    return cors(NextResponse.json({}, { status: 200 }))
  } finally {
    clearTimeout(timeout)
  }
}

export const POST = withRateLimit(handler, { requests: 10, window: "1 m" })
