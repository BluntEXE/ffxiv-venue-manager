// Hand-written type shapes for all Prisma models.
// No @prisma/client dependency — safe for mobile Metro bundler.
// Decimal fields use number | string (Prisma Decimal serialises to string over JSON).

import type {
  MembershipRole, MembershipStatus,
  EventType, EventStatus,
  PatronAction,
  TaskStatus, TaskPriority,
  PaymentType, WebhookEvent,
  FeedbackCategory, FeedbackStatus,
  ShiftStatus,
} from "./enums"

export type User = {
  id: string
  name: string | null
  email: string | null
  emailVerified: Date | null
  image: string | null
  discordId: string | null
  displayName: string | null
  isAdmin: boolean
  createdAt: Date
  updatedAt: Date
}

export type UserCharacter = {
  id: string
  userId: string
  characterName: string
  world: string
  dataCenter: string | null
  isPrimary: boolean
  createdAt: Date
}

export type Venue = {
  id: string
  name: string
  slug: string
  description: string | null
  dataCenter: string | null
  world: string | null
  ward: number | null
  plot: number | null
  timezone: string
  currencyName: string
  discordWebhookUrl: string | null
  partakeTeamId: number | null
  ownerId: string
  isActive: boolean
  settings: unknown
  createdAt: Date
  updatedAt: Date
}

export type Membership = {
  id: string
  userId: string | null
  venueId: string
  role: MembershipRole
  status: MembershipStatus
  inviteToken: string | null
  inviteEmail: string | null
  hourlyRate: number | string | null
  temporaryRole: string | null
  permanentRole: string | null
  joinedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type Role = {
  id: string
  venueId: string
  name: string
  color: string | null
  permissions: unknown
  createdAt: Date
  updatedAt: Date
}

export type Event = {
  id: string
  venueId: string
  title: string
  description: string | null
  eventType: EventType
  status: EventStatus
  startTime: Date
  endTime: Date
  partakeEventId: number | null
  partakeAttendeeCount: number | null
  attendanceCount: number | null
  createdAt: Date
  updatedAt: Date
}

export type EventTemplate = {
  id: string
  venueId: string
  name: string
  title: string
  eventType: EventType
  description: string | null
  defaultStartTime: string | null
  defaultEndTime: string | null
  createdAt: Date
  updatedAt: Date
}

export type PatronLog = {
  id: string
  venueId: string
  eventId: string | null
  characterName: string | null
  world: string | null
  action: PatronAction
  countChange: number | null
  wasWorking: boolean
  workingUserId: string | null
  reclassifiedAt: Date | null
  createdAt: Date
}

export type Service = {
  id: string
  venueId: string
  name: string
  description: string | null
  price: number | string
  category: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type Transaction = {
  id: string
  venueId: string
  eventId: string | null
  serviceId: string | null
  staffId: string | null
  amount: number | string
  customerName: string | null
  notes: string | null
  createdAt: Date
}

export type Task = {
  id: string
  venueId: string
  assignedTo: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: Date | null
  completedAt: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export type PayrollEntry = {
  id: string
  venueId: string
  membershipId: string | null
  paymentType: PaymentType
  baseRate: number | string
  hoursWorked: number | string | null
  totalAmount: number | string
  isPaid: boolean
  periodStart: Date
  periodEnd: Date
  notes: string | null
  createdAt: Date
}

export type Webhook = {
  id: string
  venueId: string
  name: string
  url: string
  events: WebhookEvent[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type Feedback = {
  id: string
  userId: string
  category: FeedbackCategory
  status: FeedbackStatus
  subject: string
  description: string
  url: string | null
  createdAt: Date
  updatedAt: Date
}

export type ApiKey = {
  id: string
  keyHash: string | null
  keyPreview: string | null
  name: string
  userId: string
  venueId: string | null
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export type Shift = {
  id: string
  venueId: string
  membershipId: string
  scheduledStart: Date
  scheduledEnd: Date
  actualStart: Date | null
  actualEnd: Date | null
  hoursWorked: number | string | null
  status: ShiftStatus
  createdAt: Date
  updatedAt: Date
}
