// String literal unions for all Prisma enums.
// Using string unions (not TS enum keyword) for Metro bundler compatibility.

export type MembershipRole = "OWNER" | "MANAGER" | "STAFF"
export type MembershipStatus = "ACTIVE" | "INVITED" | "INACTIVE"

export type EventType =
  | "SOCIAL"
  | "PERFORMANCE"
  | "TOURNAMENT"
  | "GRAND_OPENING"
  | "SPECIAL"
  | "OTHER"

export type EventStatus = "DRAFT" | "PUBLISHED" | "ACTIVE" | "COMPLETED" | "CANCELLED"

export type PatronAction = "ENTER" | "EXIT"

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

export type PaymentType = "HOURLY" | "FLAT" | "COMMISSION" | "TIP_SHARE" | "BONUS"

export type WebhookEvent =
  | "SHIFT_STARTED"
  | "SHIFT_ENDED"
  | "SALE_LOGGED"
  | "PATRON_ENTERED"
  | "PATRON_EXITED"

export type FeedbackCategory =
  | "BUG_REPORT"
  | "FEATURE_REQUEST"
  | "IMPROVEMENT"
  | "GENERAL"

export type FeedbackStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"

export type ShiftStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED"
