import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
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

  // Active shifts for on-shift status
  const activeShifts = await prisma.shift.findMany({
    where: { venueId: venue.id, status: "ACTIVE" },
    select: { membershipId: true },
  })
  const onShiftIds = new Set(activeShifts.map(s => s.membershipId))

  return (
    <VenueLayout
      venueSlug={venue.slug}
      venueName={venue.name}
      userRole={userRole}
    >
      <div className="p-4 md:p-6">
        {/* Breadcrumb */}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">{venue.name} &middot; {venue.dataCenter} &middot; {venue.world}</span>
            </div>
            <h1 className="page-h1">Staff</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
              Manage your venue's team members and roles
            </p>
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
          <Card className="p-4"><StatReadout label="Active staff" value={activeStaff.length} subtext="Members" icon={<Users />} iconVariant="blue" /></Card>
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <StatReadout label="On shift now" value={activeShifts.length} subtext={activeShifts.length > 0 ? "clocked in" : "no active shifts"} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} iconVariant="success" />
              {activeShifts.length > 0 && <span className="xiv-live-dot mt-1 shrink-0" />}
            </div>
          </Card>
          <Card className="p-4"><StatReadout label="Managers" value={managers.length} subtext="Manager role" icon={<Shield />} iconVariant="success" /></Card>
          <Card className="p-4"><StatReadout label="Staff members" value={regularStaff.length} subtext="Staff role" icon={<Users />} iconVariant="blue" /></Card>
        </div>

        {/* Staff table */}
        <StaffTable
          members={activeStaff.map(m => ({
            id: m.id,
            role: m.role as "OWNER" | "MANAGER" | "STAFF",
            customRole: m.customRole ? { name: m.customRole.name, color: m.customRole.color ?? "#9399b2" } : null,
            joinedAt: m.createdAt.toISOString(),
            isOnShift: onShiftIds.has(m.id),
            user: m.user ? { id: m.user.id, name: m.user.name, image: m.user.image } : null,
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
