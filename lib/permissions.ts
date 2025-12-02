import { MembershipRole } from "@prisma/client"

// Permission types for venue operations
export type Permission =
  | "manage_venue"
  | "manage_staff"
  | "manage_events"
  | "manage_services"
  | "manage_tasks"
  | "view_sales"
  | "log_sales"
  | "manage_webhooks"
  | "view_reports"

// Define permissions for each role
const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  OWNER: [
    "manage_venue",
    "manage_staff",
    "manage_events",
    "manage_services",
    "manage_tasks",
    "view_sales",
    "log_sales",
    "manage_webhooks",
    "view_reports",
  ],
  MANAGER: [
    "manage_events",
    "manage_tasks",
    "view_sales",
    "log_sales",
    "view_reports",
  ],
  STAFF: [
    "view_sales",
    "log_sales",
  ],
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(
  role: MembershipRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(
  role: MembershipRole,
  permissions: Permission[]
): boolean {
  return permissions.some(permission => hasPermission(role, permission))
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(
  role: MembershipRole,
  permissions: Permission[]
): boolean {
  return permissions.every(permission => hasPermission(role, permission))
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: MembershipRole): Permission[] {
  return ROLE_PERMISSIONS[role]
}

/**
 * Check if a role can manage another role
 * Rules:
 * - OWNER can manage all roles
 * - MANAGER can manage STAFF
 * - STAFF cannot manage anyone
 */
export function canManageRole(
  managerRole: MembershipRole,
  targetRole: MembershipRole
): boolean {
  if (managerRole === "OWNER") return true
  if (managerRole === "MANAGER" && targetRole === "STAFF") return true
  return false
}
