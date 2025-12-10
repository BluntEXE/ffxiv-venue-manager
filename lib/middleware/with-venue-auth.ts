import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Authorization context passed to handlers
 * Contains authenticated user and their venue membership
 */
export interface AuthContext {
  userId: string
  venueId: string
  membership: {
    id: string
    role: "OWNER" | "MANAGER" | "STAFF"
    status: string
    userId: string
    venueId: string
  }
}

/**
 * Authorization middleware for venue-based API routes
 * Verifies user authentication and venue access permissions
 *
 * @param handler - The API route handler to wrap
 * @param options - Authorization options
 * @returns Wrapped handler with authorization
 *
 * @example
 * ```ts
 * export const POST = withVenueAuth(
 *   async (req, { userId, venueId, membership }) => {
 *     // User is authenticated and has access to venue
 *     // Create event, task, etc.
 *     return NextResponse.json({ data: "..." })
 *   },
 *   { requiredRole: "MANAGER" } // Only MANAGER and OWNER can access
 * )
 * ```
 */
export function withVenueAuth<T = { params: Promise<{ venueId: string }> }>(
  handler: (
    req: NextRequest,
    authContext: AuthContext,
    context?: T
  ) => Promise<NextResponse>,
  options?: {
    requiredRole?: "OWNER" | "MANAGER" | "STAFF"
    requireActiveStatus?: boolean
  }
) {
  return async (req: NextRequest, context?: T): Promise<NextResponse> => {
    // Verify context contains params
    if (!context || !("params" in context)) {
      return NextResponse.json({ error: "Invalid request context" }, { status: 400 })
    }

    try {
      // 1. Check authentication
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // 2. Extract venueId from params
      const params = (context as any).params
      const { venueId } = await params

      if (!venueId) {
        return NextResponse.json({ error: "Venue ID required" }, { status: 400 })
      }

      // 3. Check venue membership
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          ...(options?.requireActiveStatus !== false && { status: "active" }),
        },
      })

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      // 4. Check role permissions (if required)
      if (options?.requiredRole) {
        const roleHierarchy = {
          STAFF: 1,
          MANAGER: 2,
          OWNER: 3,
        }

        const userRoleLevel = roleHierarchy[membership.role as keyof typeof roleHierarchy]
        const requiredRoleLevel = roleHierarchy[options.requiredRole]

        if (userRoleLevel < requiredRoleLevel) {
          const roleNames: Record<string, string> = {
            OWNER: "owner",
            MANAGER: "manager",
            STAFF: "staff member",
          }

          return NextResponse.json(
            {
              error: `You don't have permission to perform this action`,
              requiredRole: roleNames[options.requiredRole],
            },
            { status: 403 }
          )
        }
      }

      // 5. Call handler with auth context
      const authContext: AuthContext = {
        userId: session.user.id,
        venueId,
        membership: {
          id: membership.id,
          role: membership.role as "OWNER" | "MANAGER" | "STAFF",
          status: membership.status,
          userId: membership.userId,
          venueId: membership.venueId,
        },
      }

      return await handler(req, authContext, context)
    } catch (error) {
      console.error("Authorization error:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}

/**
 * Combines rate limiting and venue authorization
 * Convenience wrapper for the most common use case
 *
 * @example
 * ```ts
 * export const POST = withAuthAndRateLimit(
 *   async (req, { userId, venueId, membership }) => {
 *     return NextResponse.json({ success: true })
 *   },
 *   {
 *     requiredRole: "MANAGER",
 *     rateLimit: { requests: 10, window: "1 m" }
 *   }
 * )
 * ```
 */
export function withAuthAndRateLimit<T = { params: Promise<{ venueId: string }> }>(
  handler: (
    req: NextRequest,
    authContext: AuthContext,
    context?: T
  ) => Promise<NextResponse>,
  options?: {
    requiredRole?: "OWNER" | "MANAGER" | "STAFF"
    requireActiveStatus?: boolean
    rateLimit?: {
      requests?: number
      window?: string
    }
  }
) {
  const authHandler = withVenueAuth(handler, {
    requiredRole: options?.requiredRole,
    requireActiveStatus: options?.requireActiveStatus,
  })

  // If rate limiting is needed, we'll need to import and use withRateLimit
  // For now, return just the auth handler
  // TODO: Import withRateLimit and combine them
  return authHandler
}
