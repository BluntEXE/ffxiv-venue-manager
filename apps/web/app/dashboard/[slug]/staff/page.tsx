import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatGilCompact } from "@/lib/format"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatReadout } from "@/components/ui/stat-readout"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { Users, UserPlus, Shield, AlertTriangle } from "lucide-react"
import { PendingInvites } from "@/components/pending-invites"
import { StaffTable } from "@/components/staff-table"
import { VenueLayout } from "@/components/venue-layout"

import { RoleBadge } from "@/components/role-badge"

export default async function StaffPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const { slug } = await params

  // Get venue
  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: {
        where: {
          userId: session.user.id,
        },
      },
    },
  })

  if (!venue || venue.memberships.length === 0) {
    notFound()
  }

  const userRole = venue.memberships[0].role

  // Get all staff members
  const staff = await prisma.membership.findMany({
    where: { venueId: venue.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          discordId: true,
        },
      },
      customRole: true,
      additionalRoles: { include: { role: { select: { name: true, color: true } } } },
    },
    orderBy: [
      { role: "asc" }, // OWNER first, then MANAGER, then STAFF
      { createdAt: "asc" },
    ],
  })

  // Separate by role and status
  const activeStaff = staff.filter((s: typeof staff[number]) => s.status === "active" && s.user)
  const pendingInvites = staff.filter((s: typeof staff[number]) => s.status === "pending")

  const owners = activeStaff.filter((s: typeof activeStaff[number]) => s.role === "OWNER")
  const managers = activeStaff.filter((s: typeof activeStaff[number]) => s.role === "MANAGER")
  const regularStaff = activeStaff.filter((s: typeof activeStaff[number]) => s.role === "STAFF")

  const canManageStaff = ["OWNER", "MANAGER"].includes(userRole)

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Active shifts + weekly stats
  const [activeShifts, weeklyShifts, weeklyTips] = await Promise.all([
    prisma.shift.findMany({
      where: { venueId: venue.id, status: "ACTIVE" },
      select: { membershipId: true },
    }),
    prisma.shift.findMany({
      where: { venueId: venue.id, scheduledStart: { gte: weekAgo }, status: { in: ["COMPLETED", "ACTIVE"] } },
      select: { scheduledStart: true, scheduledEnd: true },
    }),
    prisma.transaction.aggregate({
      where: { venueId: venue.id, createdAt: { gte: weekAgo }, type: "TIP" },
      _sum: { amount: true },
    }),
  ])

  const hoursThisWeek = weeklyShifts.reduce((sum, s) => {
    if (!s.scheduledEnd) return sum
    return sum + (s.scheduledEnd.getTime() - s.scheduledStart.getTime()) / (1000 * 60 * 60)
  }, 0)
  const tipsThisWeek = Number(weeklyTips._sum.amount ?? 0)

  const onShiftIds = new Set(activeShifts.map(s => s.membershipId))

  return (
    <VenueLayout
      venueSlug={venue.slug}
      venueName={venue.name}
      userRole={userRole}
    >
      <div className="page-inner">
        {/* Breadcrumb */}
        {/* Header */}
        <div className="head-row">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">{venue.name} &middot; {venue.dataCenter} &middot; {venue.world}</span>
            </div>
            <h1 className="page-h1">Staff</h1>
          </div>
          {canManageStaff && (
            <div className="flex gap-2">
              <Button variant="outline" asChild size="sm" className="sm:size-default">
                <Link href={`/dashboard/${slug}/staff/roles`}>
                  <span className="hidden lg:inline">Manage Roles</span>
                  <span className="lg:hidden">Roles</span>
                </Link>
              </Button>
              <Button asChild size="sm" className="sm:size-default">
                <Link href={`/dashboard/${slug}/staff/invite`}>
                  <span className="hidden sm:inline">Invite Staff</span>
                  <span className="sm:hidden">Invite</span>
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="kpis mb-6">
          <div className="stat"><div className="top"><span className="sb"><Users size={16} /></span></div><div className="k">Active staff</div><div className="v">{activeStaff.length}</div><div className="delta flat">Members</div></div>
          <div className="stat"><div className="top"><span className={activeShifts.length > 0 ? "sb em" : "sb"}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span></div><div className="k">On shift now</div><div className="v">{activeShifts.length}</div><div className="delta flat">{activeShifts.length > 0 ? "clocked in" : "no active shifts"}</div></div>
          <div className="stat"><div className="top"><span className="sb"><Shield size={16} /></span></div><div className="k">Hours this week</div><div className="v">{Math.round(hoursThisWeek)} <span className="unit">h</span></div><div className="delta flat">scheduled</div></div>
          <div className="stat"><div className="top"><span className="sb am"><Users size={16} /></span></div><div className="k">Tips pool (wk)</div><div className="v">{tipsThisWeek > 0 ? formatGilCompact(tipsThisWeek) : "0"} <span className="unit">gil</span></div><div className="delta flat">split by hours</div></div>
        </div>

        {/* Staff table */}
        <StaffTable
          members={activeStaff.map(m => ({
            id: m.id,
            role: m.role as "OWNER" | "MANAGER" | "STAFF",
            customRole: m.customRole ? { name: m.customRole.name, color: m.customRole.color ?? "#9399b2" } : null,
            additionalRoles: m.additionalRoles
              .filter(ar => ar.roleId !== m.roleId)
              .map(ar => ({ name: ar.role.name, color: ar.role.color ?? "#9399b2" })),
            joinedAt: m.createdAt.toISOString(),
            isOnShift: onShiftIds.has(m.id),
            nickname: m.nickname ?? null,
            user: m.user ? { id: m.user.id, name: m.user.name, image: m.user.image } : null,
            venueId: venue.id,
          }))}
          slug={slug}
          canManage={canManageStaff}
        />

        {/* Pending + individual edit sections */}
        <div className="space-y-8 mt-6">
          {/* Pending Invites */}
          <PendingInvites
            invites={pendingInvites.map((invite: typeof pendingInvites[number]) => ({
              id: invite.id,
              role: invite.role,
              invitedName: invite.invitedName,
              invitedEmail: invite.invitedEmail,
              inviteToken: invite.inviteToken,
              inviteExpiresAt: invite.inviteExpiresAt,
              createdAt: invite.createdAt,
            }))}
            slug={slug}
            canManageStaff={canManageStaff}
          />

        </div>
      </div>
    </VenueLayout>
  )
}
