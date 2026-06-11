import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = process.env.RESEND_FROM ?? "XIV Venue Manager <noreply@xivvenuemanager.com>"

interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
}

/** Send a transactional email. Fire-and-forget safe: logs and swallows errors. */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set, skipping email:", subject)
    return
  }

  try {
    await resend.emails.send({ from: FROM, to, subject, html, text, replyTo: "hello@xivvenuemanager.com" })
  } catch (error) {
    console.error("Failed to send email:", error)
  }
}
