/**
 * Discord Webhook Utility
 * Sends formatted messages to Discord channels via webhooks
 */

/**
 * Sanitize user input before sending to Discord
 * Prevents webhook injection attacks by escaping special characters
 * and limiting string length
 */
function sanitizeForDiscord(input: string | null | undefined, maxLength: number = 1024): string {
  if (!input) return ""

  // Trim whitespace and limit length
  let sanitized = input.trim().slice(0, maxLength)

  // Escape Discord markdown characters that could be abused
  // This prevents formatting injection while preserving readability
  sanitized = sanitized
    .replace(/[@]/g, "@\u200B") // Zero-width space after @ to prevent mentions
    .replace(/[<>]/g, "") // Remove angle brackets to prevent custom emoji/channel injection

  return sanitized
}

/**
 * Sanitize a URL to ensure it's a valid Discord webhook URL
 */
function isValidDiscordWebhookUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "discord.com" || parsed.hostname === "discordapp.com") &&
      parsed.pathname.startsWith("/api/webhooks/")
    )
  } catch {
    return false
  }
}

export interface DiscordEmbed {
  title: string
  description: string
  color: number
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  timestamp?: string
}

export interface DiscordWebhookPayload {
  content?: string
  embeds?: DiscordEmbed[]
  username?: string
  avatar_url?: string
}

export type WebhookType =
  | "taskCreated"
  | "taskCompleted"
  | "eventCreated"
  | "eventStartingSoon"
  | "saleLogged"
  | "dailySalesSummary"
  | "staffJoined"

export type WebhookGroup = "staff" | "events" | "revenue"

// Map webhook types to their groups
const WEBHOOK_TYPE_TO_GROUP: Record<WebhookType, WebhookGroup> = {
  taskCreated: "staff",
  taskCompleted: "staff",
  staffJoined: "staff",
  eventCreated: "events",
  eventStartingSoon: "events",
  saleLogged: "revenue",
  dailySalesSummary: "revenue",
}

export interface VenueWebhookConfig {
  discordWebhooks?: {
    staff?: string
    events?: string
    revenue?: string
  }
  webhooks?: {
    [K in WebhookType]?: boolean
  }
  // Backward compatibility
  discordWebhookUrl?: string | null
}

/**
 * Get the webhook URL for a specific notification type
 */
export function getWebhookUrlForType(
  config: VenueWebhookConfig,
  webhookType: WebhookType
): string | null {
  // Check if this webhook type is enabled
  if (config.webhooks && config.webhooks[webhookType] === false) {
    return null
  }

  // Get the webhook group for this type
  const group = WEBHOOK_TYPE_TO_GROUP[webhookType]

  // Try to get grouped webhook URL
  if (config.discordWebhooks && config.discordWebhooks[group]) {
    return config.discordWebhooks[group] || null
  }

  // Fallback to legacy single webhook URL
  return config.discordWebhookUrl || null
}

/**
 * Send a message to Discord via webhook
 */
export async function sendDiscordWebhook(
  webhookUrl: string | null,
  payload: DiscordWebhookPayload
): Promise<boolean> {
  if (!webhookUrl) {
    console.warn("Discord webhook URL not provided")
    return false
  }

  // Validate webhook URL to prevent SSRF attacks
  if (!isValidDiscordWebhookUrl(webhookUrl)) {
    console.error("Invalid Discord webhook URL - must be a valid discord.com/api/webhooks URL")
    return false
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error("Discord webhook failed:", response.status, response.statusText)
      return false
    }

    return true
  } catch (error) {
    console.error("Error sending Discord webhook:", error)
    return false
  }
}

/**
 * Discord color palette
 */
export const DiscordColors = {
  // Brand colors
  Blurple: 0x5865f2,
  Green: 0x57f287,
  Yellow: 0xfee75c,
  Fuchsia: 0xeb459e,
  Red: 0xed4245,

  // Status colors
  Success: 0x43b581,
  Warning: 0xfaa61a,
  Error: 0xf04747,
  Info: 0x3498db,

  // Task priorities
  Urgent: 0xed4245,
  High: 0xfaa61a,
  Medium: 0x3498db,
  Low: 0x95a5a6,
}

/**
 * Format a task notification
 */
export function formatTaskCreatedEmbed(task: {
  title: string
  description?: string | null
  priority: string
  dueDate?: Date | null
  assignee?: { name: string | null } | null
}): DiscordEmbed {
  const priorityColors: Record<string, number> = {
    URGENT: DiscordColors.Urgent,
    HIGH: DiscordColors.High,
    MEDIUM: DiscordColors.Medium,
    LOW: DiscordColors.Low,
  }

  // Sanitize user inputs
  const safeTitle = sanitizeForDiscord(task.title, 256)
  const safeDescription = sanitizeForDiscord(task.description, 1024)
  const safeAssigneeName = sanitizeForDiscord(task.assignee?.name, 256)

  const fields = []

  if (task.assignee) {
    fields.push({
      name: "Assigned To",
      value: safeAssigneeName || "Unknown",
      inline: true,
    })
  }

  fields.push({
    name: "Priority",
    value: task.priority,
    inline: true,
  })

  if (task.dueDate) {
    fields.push({
      name: "Due Date",
      value: new Date(task.dueDate).toLocaleString(),
      inline: true,
    })
  }

  return {
    title: "📋 New Task Created",
    description: `**${safeTitle}**${safeDescription ? `\n${safeDescription}` : ""}`,
    color: priorityColors[task.priority] || DiscordColors.Info,
    fields,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format a task completion notification
 */
export function formatTaskCompletedEmbed(task: {
  title: string
  priority: string
  completer?: { name: string | null } | null
}): DiscordEmbed {
  // Sanitize user inputs
  const safeTitle = sanitizeForDiscord(task.title, 256)
  const safeCompleterName = sanitizeForDiscord(task.completer?.name, 256)

  const fields = []

  if (task.completer) {
    fields.push({
      name: "Completed By",
      value: safeCompleterName || "Unknown",
      inline: true,
    })
  }

  return {
    title: "✅ Task Completed",
    description: `**${safeTitle}**`,
    color: DiscordColors.Success,
    fields,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format an event created notification
 */
export function formatEventCreatedEmbed(event: {
  title: string
  description?: string | null
  eventType: string
  startTime: Date
  endTime: Date
}): DiscordEmbed {
  // Sanitize user inputs
  const safeTitle = sanitizeForDiscord(event.title, 256)
  const safeDescription = sanitizeForDiscord(event.description, 1024)

  return {
    title: "📅 New Event Created",
    description: `**${safeTitle}**${safeDescription ? `\n${safeDescription}` : ""}`,
    color: DiscordColors.Blurple,
    fields: [
      {
        name: "Type",
        value: event.eventType.replace("_", " "),
        inline: true,
      },
      {
        name: "Start Time",
        value: new Date(event.startTime).toLocaleString(),
        inline: true,
      },
      {
        name: "End Time",
        value: new Date(event.endTime).toLocaleString(),
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format an event starting soon notification
 */
export function formatEventStartingSoonEmbed(event: {
  title: string
  startTime: Date
}): DiscordEmbed {
  // Sanitize user inputs
  const safeTitle = sanitizeForDiscord(event.title, 256)

  return {
    title: "⏰ Event Starting Soon!",
    description: `**${safeTitle}** starts in less than 1 hour!`,
    color: DiscordColors.Warning,
    fields: [
      {
        name: "Start Time",
        value: new Date(event.startTime).toLocaleString(),
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format a sale logged notification
 */
export function formatSaleLoggedEmbed(transaction: {
  amount: number
  service?: { name: string } | null
  customerName?: string | null
  staff?: { name: string | null } | null
}): DiscordEmbed {
  // Sanitize user inputs
  const safeServiceName = sanitizeForDiscord(transaction.service?.name, 256)
  const safeCustomerName = sanitizeForDiscord(transaction.customerName, 256)
  const safeStaffName = sanitizeForDiscord(transaction.staff?.name, 256)

  const fields = []

  if (transaction.service) {
    fields.push({
      name: "Service",
      value: safeServiceName || "Unknown",
      inline: true,
    })
  }

  if (transaction.customerName) {
    fields.push({
      name: "Customer",
      value: safeCustomerName,
      inline: true,
    })
  }

  if (transaction.staff) {
    fields.push({
      name: "Logged By",
      value: safeStaffName || "Unknown",
      inline: true,
    })
  }

  return {
    title: "💰 Sale Logged",
    description: `**Amount: ${transaction.amount.toLocaleString()} Gil**`,
    color: DiscordColors.Green,
    fields,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format a daily sales summary notification
 */
export function formatDailySalesSummaryEmbed(summary: {
  date: string
  totalSales: number
  totalRevenue: number
  topService?: { name: string; sales: number } | null
}): DiscordEmbed {
  // Sanitize user inputs
  const safeTopServiceName = sanitizeForDiscord(summary.topService?.name, 256)

  const fields = [
    {
      name: "Total Sales",
      value: `${summary.totalSales} transactions`,
      inline: true,
    },
    {
      name: "Total Revenue",
      value: `${summary.totalRevenue.toLocaleString()} Gil`,
      inline: true,
    },
  ]

  if (summary.topService) {
    fields.push({
      name: "Top Service",
      value: `${safeTopServiceName} (${summary.topService.sales} sales)`,
      inline: false,
    })
  }

  return {
    title: "📊 Daily Sales Summary",
    description: `Sales report for **${summary.date}**`,
    color: DiscordColors.Info,
    fields,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format a staff joined notification
 */
export function formatStaffJoinedEmbed(staff: {
  name: string | null
  role: string
}): DiscordEmbed {
  // Sanitize user inputs
  const safeName = sanitizeForDiscord(staff.name, 256)

  return {
    title: "👥 New Staff Member Joined",
    description: `**${safeName || "Unknown"}** has joined the venue as **${staff.role}**`,
    color: DiscordColors.Success,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Format an app-level feedback notification (sent to the admin channel,
 * not per-venue). Triggered when a user submits via POST /api/feedback.
 */
export function formatFeedbackSubmittedEmbed(feedback: {
  category: string
  subject: string
  description: string
  url?: string | null
  user: { name?: string | null; displayName?: string | null; email?: string | null }
}): DiscordEmbed {
  const safeSubject = sanitizeForDiscord(feedback.subject, 256)
  const safeDescription = sanitizeForDiscord(feedback.description, 1024)
  const safeUserName = sanitizeForDiscord(
    feedback.user.displayName || feedback.user.name || feedback.user.email || "Unknown",
    256
  )
  const safeUrl = sanitizeForDiscord(feedback.url, 512)

  const colorByCategory: Record<string, number> = {
    BUG_REPORT: DiscordColors.Red,
    FEATURE_REQUEST: DiscordColors.Blurple,
    IMPROVEMENT: DiscordColors.Info,
    GENERAL: DiscordColors.Yellow,
  }

  const iconByCategory: Record<string, string> = {
    BUG_REPORT: "🐛",
    FEATURE_REQUEST: "💡",
    IMPROVEMENT: "✨",
    GENERAL: "💬",
  }

  const fields = [
    { name: "From", value: safeUserName, inline: true },
    { name: "Category", value: feedback.category, inline: true },
  ]

  if (safeUrl) {
    fields.push({ name: "Page", value: safeUrl, inline: false })
  }

  fields.push({ name: "Details", value: safeDescription || "(no description)", inline: false })

  return {
    title: `${iconByCategory[feedback.category] ?? "💬"} New Feedback: ${safeSubject || "(no subject)"}`,
    description: "A user submitted feedback on xivvenuemanager.com",
    color: colorByCategory[feedback.category] ?? DiscordColors.Info,
    fields,
    timestamp: new Date().toISOString(),
  }
}
