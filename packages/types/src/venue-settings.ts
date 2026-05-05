/**
 * Venue Settings Type Definitions
 * Provides type safety for venue.settings JSON field
 */

/**
 * Discord webhook configuration
 * Supports multiple webhook URLs for different event types
 */
export interface DiscordWebhooks {
  /** Staff-related notifications (invites, role changes) */
  staff?: string
  /** Event notifications (created, starting soon) */
  events?: string
  /** Revenue and sales notifications */
  revenue?: string
}

/**
 * Webhook notification toggles
 * Controls which events trigger Discord notifications
 */
export interface WebhookSettings {
  /** Task created notification */
  taskCreated?: boolean
  /** Task completed notification */
  taskCompleted?: boolean
  /** Mirror Partake-synced events to Discord (post / patch / cancel) */
  partakeEvent?: boolean
  /** Sale logged notification */
  saleLogged?: boolean
  /** Daily sales summary */
  dailySalesSummary?: boolean
  /** Staff member joined */
  staffJoined?: boolean
}

/**
 * Task visibility settings
 * Controls what tasks staff members can see
 */
export type TaskVisibility = "all" | "assigned" | "assigned_unassigned"

/**
 * Sales visibility settings
 * Controls what sales data staff members can see
 */
export type SalesVisibility = "all" | "own" | "none"

/**
 * Revenue visibility settings
 * Controls what revenue data staff members can see
 */
export type RevenueVisibility = "all" | "hide" | "own"

/**
 * Event visibility settings
 * Controls which events are shown to different roles
 */
export type EventVisibility = "all" | "published"

/**
 * Complete venue settings object
 * Stored in Prisma venue.settings JSON field
 */
export interface VenueSettings {
  taskVisibility: TaskVisibility
  salesVisibility: SalesVisibility
  revenueVisibility: RevenueVisibility
  eventVisibility: EventVisibility
  discordWebhooks: DiscordWebhooks
  webhooks: WebhookSettings
  /** Legacy single webhook URL */
  discordWebhookUrl?: string | null
  /** Partake.gg team integration ID */
  partakeTeamId?: number | null
}

/**
 * Type guard to check if value is valid VenueSettings
 */
export function isVenueSettings(value: unknown): value is VenueSettings {
  if (!value || typeof value !== "object") {
    return false
  }

  const settings = value as Partial<VenueSettings>

  // Check taskVisibility if present
  if (settings.taskVisibility !== undefined) {
    if (!["all", "assigned", "assigned_unassigned"].includes(settings.taskVisibility)) {
      return false
    }
  }

  // Check salesVisibility if present
  if (settings.salesVisibility !== undefined) {
    if (!["all", "own", "none"].includes(settings.salesVisibility)) {
      return false
    }
  }

  // Check revenueVisibility if present
  if (settings.revenueVisibility !== undefined) {
    if (!["all", "hide", "own"].includes(settings.revenueVisibility)) {
      return false
    }
  }

  // Check eventVisibility if present
  if (settings.eventVisibility !== undefined) {
    if (!["all", "published"].includes(settings.eventVisibility)) {
      return false
    }
  }

  return true
}

/**
 * Parse unknown JSON value to VenueSettings with fallback
 * Safe wrapper that handles invalid/null values
 */
export function parseVenueSettings(value: unknown): VenueSettings {
  if (isVenueSettings(value)) {
    return value
  }

  return getDefaultVenueSettings()
}

/**
 * Get default venue settings
 * Used when creating new venues
 */
export function getDefaultVenueSettings(): VenueSettings {
  return {
    taskVisibility: "all",
    salesVisibility: "all",
    revenueVisibility: "all",
    eventVisibility: "all",
    discordWebhooks: {
      staff: "",
      events: "",
      revenue: "",
    },
    webhooks: {
      taskCreated: false,
      taskCompleted: false,
      partakeEvent: false,
      saleLogged: false,
      dailySalesSummary: false,
      staffJoined: false,
    },
  }
}
