import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"
import { sendDiscordWebhook, formatFeedbackSubmittedEmbed } from "@/lib/discord-webhook"

const VALID_CATEGORIES = ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"] as const

export async function POST(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const body = await req.json().catch(() => ({}))
  const { category, subject, description } = body

  if (!category || !subject || !description) {
    return NextResponse.json({ error: "Missing required fields: category, subject, description" }, { status: 400 })
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 })
  }

  const userAgent = req.headers.get("user-agent") ?? undefined

  const feedback = await prisma.feedback.create({
    data: {
      userId,
      category,
      subject: String(subject).trim(),
      description: String(description).trim(),
      url: "mobile-app",
      userAgent,
    },
    include: {
      user: { select: { id: true, name: true, displayName: true, email: true } },
    },
  })

  const adminWebhookUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL
  if (adminWebhookUrl) {
    const embed = formatFeedbackSubmittedEmbed({
      category: feedback.category,
      subject: feedback.subject,
      description: feedback.description,
      url: feedback.url,
      user: feedback.user,
    })
    void sendDiscordWebhook(adminWebhookUrl, { embeds: [embed] }).catch(() => {})
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
