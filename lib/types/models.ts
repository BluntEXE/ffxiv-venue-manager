/**
 * Centralized Type Definitions for API Responses and Frontend Models
 *
 * These types represent the data structures used across the application,
 * derived from Prisma schema but tailored for frontend consumption.
 */

import { MembershipRole } from "@prisma/client"

// ============================================
// VENUE TYPES
// ============================================

/**
 * Minimal venue info for lists and selectors
 */
export interface VenueListItem {
  id: string
  name: string
  slug: string
  dataCenter?: string
  world?: string
  membership?: {
    role: MembershipRole
  }
  memberships?: Array<{
    role: MembershipRole
    userId?: string | null
  }>
}

/**
 * Full venue details including settings
 */
export interface VenueDetails extends VenueListItem {
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  location: string | null
  timezone: string
  currencyName: string
  settings: unknown // JSON field - use parseVenueSettings()
  discordWebhookUrl: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ============================================
// MEMBERSHIP TYPES
// ============================================

/**
 * User info for display purposes
 */
export interface UserBasicInfo {
  id: string
  name: string | null
  image: string | null
  email?: string | null
}

/**
 * Membership with user info for staff lists
 */
export interface MembershipWithUser {
  id: string
  userId: string | null
  venueId: string
  role: MembershipRole
  roleId: string | null
  hireDate: Date
  status: string
  inviteToken: string | null
  inviteExpiresAt: Date | null
  invitedName: string | null
  invitedEmail: string | null
  createdAt: Date
  user: UserBasicInfo | null
  customRole?: RoleBasicInfo | null
}

/**
 * Pending invite (membership without accepted user)
 */
export interface PendingInvite {
  id: string
  role: string
  invitedName: string | null
  invitedEmail: string | null
  inviteToken: string | null
  inviteExpiresAt: Date | null
  createdAt: Date
}

// ============================================
// ROLE TYPES
// ============================================

/**
 * Basic role info for selectors and badges
 */
export interface RoleBasicInfo {
  id: string
  name: string
  color: string | null
}

/**
 * Full role details for role management
 */
export interface RoleDetails extends RoleBasicInfo {
  responsibilities: string | null
  permissions: Record<string, boolean> | null
  _count?: {
    memberships: number
  }
}

// ============================================
// EVENT TYPES
// ============================================

/**
 * Event for calendar display
 */
export interface EventCalendarItem {
  id: string
  title: string
  startTime: Date
  endTime: Date
  status: string
  eventType: string
}

/**
 * Event for list display
 */
export interface EventListItem extends EventCalendarItem {
  description: string | null
  timezone: string
  venueId: string
  createdById: string
  createdAt: Date
}

/**
 * Full event details
 */
export interface EventDetails extends EventListItem {
  attendanceCount: number | null
  revenue: number | null
  updatedAt: Date
  createdBy: UserBasicInfo
}

// ============================================
// TASK TYPES
// ============================================

/**
 * Task for list display
 */
export interface TaskListItem {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  category: string | null
  dueDate: Date | null
  completedAt: Date | null
  assignedTo: string | null
  assignedRoleId: string | null
  createdAt: Date
  assignee: UserBasicInfo | null
  assignedRole: RoleBasicInfo | null
}

/**
 * Full task details
 */
export interface TaskDetails extends TaskListItem {
  venueId: string
  completedBy: string | null
  updatedAt: Date
  completer: UserBasicInfo | null
}

// ============================================
// SERVICE TYPES
// ============================================

/**
 * Service for selectors
 */
export interface ServiceBasicInfo {
  id: string
  name: string
  price: number
}

/**
 * Full service details
 */
export interface ServiceDetails extends ServiceBasicInfo {
  description: string | null
  category: string | null
  isActive: boolean
  venueId: string
  createdAt: Date
  updatedAt: Date
}

// ============================================
// TRANSACTION TYPES
// ============================================

/**
 * Transaction for list display
 */
export interface TransactionListItem {
  id: string
  amount: number
  customerName: string | null
  notes: string | null
  createdAt: Date
  staffId: string | null
  serviceId: string | null
  eventId: string | null
  staff: UserBasicInfo | null
  service: ServiceBasicInfo | null
  event: { id: string; title: string } | null
}

// ============================================
// PAYROLL TYPES
// ============================================

/**
 * Payroll entry for list display
 */
export interface PayrollEntryListItem {
  id: string
  paymentType: string
  baseRate: number
  hoursWorked: number | null
  bonusAmount: number | null
  totalAmount: number
  periodStart: Date
  periodEnd: Date
  isPaid: boolean
  paidAt: Date | null
  notes: string | null
  membershipId: string
  membership: {
    id: string
    user: UserBasicInfo | null
    customRole: RoleBasicInfo | null
  }
}

// ============================================
// EVENT TEMPLATE TYPES
// ============================================

/**
 * Event template for selectors and lists
 */
export interface EventTemplateListItem {
  id: string
  name: string
  title: string
  description: string | null
  eventType: string
  timezone: string
  defaultStartTime: string
  defaultEndTime: string
}

// ============================================
// FEEDBACK TYPES (Admin)
// ============================================

/**
 * Feedback for admin list
 */
export interface FeedbackListItem {
  id: string
  category: string
  status: string
  subject: string
  description: string
  url: string | null
  adminNotes: string | null
  createdAt: Date
  updatedAt: Date
  user: UserBasicInfo
}

// ============================================
// ANALYTICS TYPES
// ============================================

/**
 * Revenue data point for charts
 */
export interface RevenueDataPoint {
  date: string
  revenue: number
  transactions: number
}

/**
 * Service breakdown for charts
 */
export interface ServiceBreakdown {
  name: string
  total: number
  count: number
}

/**
 * Analytics summary
 */
export interface AnalyticsSummary {
  totalRevenue: number
  totalTransactions: number
  averageTransaction: number
  topServices: ServiceBreakdown[]
  revenueByDay: RevenueDataPoint[]
}
