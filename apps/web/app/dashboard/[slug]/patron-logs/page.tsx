import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { Breadcrumb } from "@/components/breadcrumb"
import { PatronLogsManager } from "@/components/patron-logs-manager"

const PAGE_LIMIT = 200

type SearchParams = {
  eventId?: string
  from?: string
  to?: string
  character?: string
  classification?: "all" | "patron" | "staff"
}

export default async function PatronLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params
  const sp = await searchParams

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  if (!["OWNER", "MANAGER"].includes(userRole)) notFound()

  // Default range: last 7 days
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const from = sp.from ? new Date(sp.from) : defaultFrom
  const to = sp.to ? new Date(sp.to) : now

  // Build query
  const where: {
    venueId: string
    eventId?: string
    timestamp?: { gte?: Date; lte?: Date }
    characterName?: string
    wasWorking?: boolean
  } = { venueId: venue.id }

  if (sp.eventId) where.eventId = sp.eventId
  if (sp.character) where.characterName = sp.character
  if (sp.classification === "staff") where.wasWorking = true
  if (sp.classification === "patron") where.wasWorking = false

  // Event filter overrides date range (event has its own window)
  if (!sp.eventId) {
    where.timestamp = { gte: from, lte: to }
  }

  const [logs, events, staff, distinctCharacters] = await Promise.all([
    prisma.patronLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: PAGE_LIMIT,
      include: {
        workingUser: { select: { id: true, name: true } },
        reclassifiedBy: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
      },
    }),
    prisma.event.findMany({
      where: {
        venueId: venue.id,
        startTime: {
          gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { startTime: "desc" },
      select: { id: true, title: true, startTime: true, endTime: true },
      take: 100,
    }),
    prisma.membership.findMany({
      where: { venueId: venue.id, status: "active" },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.patronLog.findMany({
      where: { venueId: venue.id, characterName: { not: null } },
      distinct: ["characterName"],
      select: { characterName: true, world: true },
      orderBy: { characterName: "asc" },
      take: 500,
    }),
  ])

  // Suggested staff per character (UserCharacter links)
  const characterUserMap = await prisma.userCharacter.findMany({
    where: {
      OR: logs
        .filter((l) => l.characterName && l.world)
        .map((l) => ({ characterName: l.characterName!, world: l.world! })),
    },
    select: { characterName: true, world: true, userId: true, user: { select: { name: true } } },
  })

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: venue.name, href: `/dashboard/${slug}` },
            { label: "Patron Logs" },
          ]}
        />

        <div className="mb-6 md:mb-8">
          <h1 className="font-cinzel text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-balance">Patron Logs</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
            Review and reclassify staff vs. patron visits. Use this when staff forgot to clock in
            or were marked working by mistake.
          </p>
        </div>

        <PatronLogsManager
          venueId={venue.id}
          logs={logs.map((l) => ({
            id: l.id,
            timestamp: l.timestamp.toISOString(),
            characterName: l.characterName,
            world: l.world,
            action: l.action,
            wasWorking: l.wasWorking,
            workingUser: l.workingUser,
            event: l.event,
            reclassifiedAt: l.reclassifiedAt?.toISOString() ?? null,
            reclassifiedBy: l.reclassifiedBy,
            reclassifyReason: l.reclassifyReason,
          }))}
          events={events.map((e) => ({
            id: e.id,
            title: e.title,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime?.toISOString() ?? null,
          }))}
          staff={staff
            .filter((m) => m.user)
            .map((m) => ({ id: m.user!.id, name: m.user!.name ?? "(no name)" }))}
          characters={distinctCharacters
            .filter((c) => c.characterName)
            .map((c) => ({ name: c.characterName!, world: c.world ?? "" }))}
          characterUserMap={characterUserMap.map((c) => ({
            characterName: c.characterName,
            world: c.world,
            userId: c.userId,
            userName: c.user?.name ?? "(no name)",
          }))}
          initialFilters={{
            eventId: sp.eventId ?? "",
            from: from.toISOString().slice(0, 10),
            to: to.toISOString().slice(0, 10),
            character: sp.character ?? "",
            classification: sp.classification ?? "all",
          }}
          limitHit={logs.length === PAGE_LIMIT}
        />
      </div>
    </VenueLayout>
  )
}
