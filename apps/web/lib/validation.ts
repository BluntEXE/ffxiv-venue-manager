import { z } from "zod"

// ============================================
// Common Field Validators
// ============================================

export const validators = {
  venueName: z.string().min(1, "Name is required").max(100, "Name too long (max 100 characters)"),
  venueDescription: z.string().max(2000, "Description too long (max 2000 characters)").optional(),
  venueLocation: z.string().max(200, "Location too long (max 200 characters)").optional(),
  venueDistrict: z.string().max(50).optional().nullable(),
  venueWard: z.number().int().min(1).max(30).optional().nullable(),
  venuePlot: z.number().int().min(1).max(60).optional().nullable(),
  eventTitle: z.string().min(1, "Title is required").max(150, "Title too long (max 150 characters)"),
  eventDescription: z.string().max(3000, "Description too long (max 3000 characters)").optional(),
  customerName: z.string().max(100, "Customer name too long (max 100 characters)").optional(),
  transactionNotes: z.string().max(500, "Notes too long (max 500 characters)").optional(),
  serviceName: z.string().min(1, "Name is required").max(100, "Name too long (max 100 characters)"),
  serviceDescription: z.string().max(1000, "Description too long (max 1000 characters)").optional(),
  serviceCategory: z.string().max(50, "Category too long (max 50 characters)").optional(),
  roleName: z.string().min(1, "Name is required").max(50, "Name too long (max 50 characters)"),
  roleDescription: z.string().max(500, "Description too long (max 500 characters)").optional(),
  taskTitle: z.string().min(1, "Title is required").max(200, "Title too long (max 200 characters)"),
  taskDescription: z.string().max(2000, "Description too long (max 2000 characters)").optional(),
  taskNotes: z.string().max(1000, "Notes too long (max 1000 characters)").optional(),
  payrollNotes: z.string().max(500, "Notes too long (max 500 characters)").optional(),
  feedbackSubject: z.string().min(1, "Subject is required").max(200, "Subject too long (max 200 characters)"),
  feedbackDescription: z.string().min(10, "Description too short").max(5000, "Description too long (max 5000 characters)"),
  webhookUrl: z.string().url("Invalid webhook URL").max(500, "URL too long").optional(),
  url: z.string().url("Invalid URL").max(500, "URL too long").optional(),
  slug: z.string()
    .min(1, "Slug is required")
    .max(100, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
  email: z.string().email("Invalid email").max(255, "Email too long"),
  amount: z.number().min(0, "Amount must be positive").max(999999999, "Amount too large"),
  price: z.number().min(0, "Price must be positive").max(999999999, "Price too large"),
  percentage: z.number().min(0, "Percentage must be 0-100").max(100, "Percentage must be 0-100"),
  datetime: z.string().datetime({ message: "Invalid datetime format (ISO 8601 required)" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD required)"),
  timezone: z.string().max(50, "Timezone string too long"),
}

// ============================================
// Discord Content Sanitization
// ============================================

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

  sanitized = sanitized.replace(/@(everyone|here)/gi, "@​$1")

  if (stripUrls) {
    sanitized = sanitized.replace(/https?:\/\/[^\s]+/gi, "[link removed]")
  }

  if (escapeMarkdown) {
    sanitized = sanitized
      .replace(/\*/g, "\\*")
      .replace(/_/g, "\\_")
      .replace(/~/g, "\\~")
      .replace(/`/g, "\\`")
  }

  return sanitized.slice(0, maxLength)
}
