import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NavbarClient } from "./navbar-client"

export async function Navbar() {
  const session = await getServerSession(authOptions)

  let venues: Array<{ id: string; name: string; slug: string }> = []
  if (session?.user?.id) {
    venues = await prisma.venue.findMany({
      where: {
        memberships: {
          some: {
            userId: session.user.id,
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    })
  }

  return <NavbarClient session={session} venues={venues} />
}
