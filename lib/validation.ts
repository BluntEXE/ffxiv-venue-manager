import { z } from "zod"

/**
 * Centralized validation schemas with security-focused length limits
 * Prevents database bloat, DoS attacks, and malicious input
 */

// ============================================
// Common Field Validators
// ============================================

export const validators = {
  // Text fields
  venueName: z.string().min(1, "Name is required").max(100, "Name too long (max 100 characters)"),
  venueDescription: z.string().max(2000, "Description too long (max 2000 characters)").optional(),
  venueLocation: z.string().max(200, "Location too long (max 200 characters)").optional(),

  // Event fields
  eventTitle: z.string().min(1, "Title is required").max(150, "Title too long (max 150 characters)"),
  eventDescription: z.string().max(3000, "Description too long (max 3000 characters)").optional(),

  // Transaction fields
  customerName: z.string().max(100, "Customer name too long (max 100 characters)").optional(),
  transactionNotes: z.string().max(500, "Notes too long (max 500 characters)").optional(),

  // Service fields
  serviceName: z.string().min(1, "Name is required").max(100, "Name too long (max 100 characters)"),
  serviceDescription: z.string().max(1000, "Description too long (max 1000 characters)").optional(),
  serviceCategory: z.string().max(50, "Category too long (max 50 characters)").optional(),

  // Role fields
  roleName: z.string().min(1, "Name is required").max(50, "Name too long (max 50 characters)"),
  roleDescription: z.string().max(500, "Description too long (max 500 characters)").optional(),

  // Task fields
  taskTitle: z.string().min(1, "Title is required").max(200, "Title too long (max 200 characters)"),
  taskDescription: z.string().max(2000, "Description too long (max 2000 characters)").optional(),
  taskNotes: z.string().max(1000, "Notes too long (max 1000 characters)").optional(),

  // Payroll fields
  payrollNotes: z.string().max(500, "Notes too long (max 500 characters)").optional(),

  // Feedback fields
  feedbackSubject: z.string().min(1, "Subject is required").max(200, "Subject too long (max 200 characters)"),
  feedbackDescription: z.string().min(10, "Description too short").max(5000, "Description too long (max 5000 characters)"),

  // URL fields (with protocol validation)
  webhookUrl: z.string().url("Invalid webhook URL").max(500, "URL too long").optional(),
  url: z.string().url("Invalid URL").max(500, "URL too long").optional(),

  // Slug (URL-safe identifier)
  slug: z.string()
    .min(1, "Slug is required")
    .max(100, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),

  // Email
  email: z.string().email("Invalid email").max(255, "Email too long"),

  // Numeric fields
  amount: z.number().min(0, "Amount must be positive").max(999999999, "Amount too large"),
  price: z.number().min(0, "Price must be positive").max(999999999, "Price too large"),
  percentage: z.number().min(0, "Percentage must be 0-100").max(100, "Percentage must be 0-100"),

  // Date/time validators
  datetime: z.string().datetime({ message: "Invalid datetime format (ISO 8601 required)" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD required)"),
  timezone: z.string().max(50, "Timezone string too long"),
}

// ============================================
// Date Range Validation
// ============================================

/**
 * Validates that start date is before end date
 */
export function validateDateRange(startDate: Date, endDate: Date): boolean {
  return startDate < endDate
}

/**
 * Schema for date range queries
 */
export const dateRangeQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true
    return new Date(data.startDate) < new Date(data.endDate)
  },
  { message: "Start date must be before end date" }
)

// ============================================
// Pagination Validation
// ============================================

export const paginationSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
})

// ============================================
// Discord Content Sanitization
// ============================================

/**
 * Sanitizes text for Discord webhooks
 * - Breaks @everyone and @here mentions
 * - Removes or escapes URLs (optional)
 * - Limits length to prevent spam
 * - Escapes markdown formatting (optional)
 */
export function sanitizeDiscordContent(
  text: string | null | undefined,
  options: {
    maxLength?: number
    stripUrls?: boolean
    escapeMarkdown?: boolean
  } = {}
): string {
  if (!text) return ""

  const {
    maxLength = 1000,
    stripUrls = false,
    escapeMarkdown = false,
  } = options

  let sanitized = text

  // Break mass mentions by inserting zero-width space
  sanitized = sanitized.replace(/@(everyone|here)/gi, "@\u200b$1")

  // Strip or escape URLs
  if (stripUrls) {
    sanitized = sanitized.replace(/https?:\/\/[^\s]+/gi, "[link removed]")
  }

  // Escape Discord markdown (optional)
  if (escapeMarkdown) {
    sanitized = sanitized
      .replace(/\*/g, "\\*")
      .replace(/_/g, "\\_")
      .replace(/~/g, "\\~")
      .replace(/`/g, "\\`")
  }

  // Limit length
  return sanitized.slice(0, maxLength)
}

/**
 * Validates and sanitizes Discord webhook URL
 */
export function validateDiscordWebhookUrl(url: string | null | undefined): string | null {
  if (!url) return null

  // Must be a Discord webhook URL
  if (!url.startsWith("https://discord.com/api/webhooks/") &&
      !url.startsWith("https://discordapp.com/api/webhooks/")) {
    throw new Error("Invalid Discord webhook URL")
  }

  // Check length
  if (url.length > 500) {
    throw new Error("Webhook URL too long")
  }

  return url
}

// ============================================
// Enum Validators
// ============================================

export const eventStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"])
export const eventTypeSchema = z.enum(["SOCIAL", "PERFORMANCE", "TOURNAMENT", "GRAND_OPENING", "SPECIAL", "OTHER"])
export const membershipRoleSchema = z.enum(["OWNER", "MANAGER", "STAFF"])
export const taskStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"])
