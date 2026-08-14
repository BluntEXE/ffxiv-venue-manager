import { NextResponse } from "next/server"
import { z } from "zod"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"
import { sendDiscordWebhook, formatFeedbackSubmittedEmbed } from "@/lib/discord-webhook"
import { validators } from "@/lib/validation"

const feedbackSchema = z.object({
  category: validators.feedbackCategory,
  subject: validators.feedbackSubject,
  description: validators.feedbackDescription,
})

export async function POST(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const body = await req.json().catch(() => ({}))
  let parsed: z.infer<typeof feedbackSchema>
  try {
    parsed = feedbackSchema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    throw error
  }
  const { category, subject, description } = parsed

  const userAgent = req.headers.get("user-agent") ?? undefined

  const feedback = await prisma.feedback.create({
    data: {
      userId,
      category,
      subject: subject.trim(),
      description: description.trim(),
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
