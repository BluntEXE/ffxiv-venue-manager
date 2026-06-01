import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NavbarClient } from "./navbar-client"

export async function Navbar() {
  const session = await getServerSession(authOptions)

  let venues: Array<{ id: string; name: string; slug: string; role: string }> = []
  if (session?.user?.id) {
    const memberships = await prisma.venueMembership.findMany({
      where: { userId: session.user.id },
      select: {
        role: true,
        venue: { select: { id: true, name: true, slug: true } },
      },
    })
    venues = memberships.map((m) => ({ ...m.venue, role: m.role }))
  }

  return <NavbarClient session={session} venues={venues} />
}
