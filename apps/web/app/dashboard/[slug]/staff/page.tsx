import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { PendingInvites } from "@/components/pending-invites"
import { VenueLayout } from "@/components/venue-layout"
import { Breadcrumb } from "@/components/breadcrumb"

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

  return (
    <VenueLayout
      venueSlug={venue.slug}
      venueName={venue.name}
      userRole={userRole}
    >
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: venue.name, href: `/dashboard/${slug}` },
            { label: "Staff" },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="font-cinzel text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide">Staff Management</h1>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-cinzel text-3xl font-bold tracking-wide text-[var(--xiv-blue)]">{activeStaff.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Members</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Invites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`font-cinzel text-3xl font-bold tracking-wide ${pendingInvites.length > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>{pendingInvites.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting signup</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Managers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-cinzel text-3xl font-bold tracking-wide text-[var(--xiv-blue)]">{managers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Manager role</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-cinzel text-3xl font-bold tracking-wide text-zinc-300">{regularStaff.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Staff role</p>
            </CardContent>
          </Card>
        </div>

        {/* Staff Lists */}
        <div className="space-y-8">
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

          {/* Owners */}
          {owners.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Owners</h2>
              <div className="grid grid-cols-1 gap-4">
                {owners.map((member: typeof owners[number]) => (
                  <Card key={member.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={member.user?.image || undefined} />
                            <AvatarFallback>
                              {member.user?.name?.substring(0, 2).toUpperCase() || "??"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{member.user?.name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              Joined {format(new Date(member.createdAt), "PPP")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <RoleBadge role={member.role} />
                          {member.customRole && (
                            <RoleBadge
                              role={member.customRole.name}
                              color={member.customRole.color}
                            />
                          )}
                          {userRole === "OWNER" && (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/dashboard/${slug}/staff/${member.id}`}>
                                Edit Role
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Managers */}
          {managers.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Managers</h2>
              <div className="grid grid-cols-1 gap-4">
                {managers.map((member: typeof managers[number]) => (
                  <Card key={member.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={member.user?.image || undefined} />
                            <AvatarFallback>
                              {member.user?.name?.substring(0, 2).toUpperCase() || "??"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{member.user?.name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              Joined {format(new Date(member.createdAt), "PPP")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <RoleBadge role={member.role} />
                          {member.customRole && (
                            <RoleBadge
                              role={member.customRole.name}
                              color={member.customRole.color}
                            />
                          )}
                          {canManageStaff && (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/dashboard/${slug}/staff/${member.id}`}>
                                Edit Role
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Regular Staff */}
          {regularStaff.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Staff Members</h2>
              <div className="grid grid-cols-1 gap-4">
                {regularStaff.map((member: typeof regularStaff[number]) => (
                  <Card key={member.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={member.user?.image || undefined} />
                            <AvatarFallback>
                              {member.user?.name?.substring(0, 2).toUpperCase() || "??"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{member.user?.name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              Joined {format(new Date(member.createdAt), "PPP")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <RoleBadge role={member.role} />
                          {member.customRole && (
                            <RoleBadge
                              role={member.customRole.name}
                              color={member.customRole.color}
                            />
                          )}
                          {canManageStaff && (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/dashboard/${slug}/staff/${member.id}`}>
                                Edit Role
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {staff.length === 1 && (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  You're the only team member. Invite staff to help manage your venue!
                </p>
                {canManageStaff && (
                  <Button asChild>
                    <Link href={`/dashboard/${slug}/staff/invite`}>
                      Invite Your First Staff Member
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </VenueLayout>
  )
}
