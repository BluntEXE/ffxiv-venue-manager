import { Prisma, Role } from "@/generated/prisma/client"
import { prisma as defaultPrisma } from "@/lib/prisma"

/**
 * Union of accepted prisma clients. We want this helper to be usable both
 * standalone AND inside a prisma.$transaction(async (tx) => …) block, so
 * callers can keep atomicity when doing the Manager-role assignment as
 * part of a larger write (e.g. venue create).
 */
type PrismaLike = Prisma.TransactionClient | typeof defaultPrisma

/**
 * Find-or-create the Manager role for a venue.
 *
 * "Manager" is the "sees everything" default custom role - every OWNER/MANAGER
 * tier membership auto-gets it when they have no other custom role assigned,
 * and every new Service auto-links to it. That way the plugin's strict
 * "show only my assigned role + its services" behavior still gives owners
 * full visibility without leaking the rest of the role catalog.
 *
 * Idempotent via upsert on the Role.@@unique([venueId, name]) compound key.
 * Safe to call at venue create, service create, staff invite, and in
 * backfill scripts.
 */
export async function ensureManagerRole(
  venueId: string,
  client: PrismaLike = defaultPrisma
): Promise<Role> {
  return client.role.upsert({
    where: { venueId_name: { venueId, name: "Manager" } },
    update: {},
    create: {
      venueId,
      name: "Manager",
      color: "#6366f1",
      responsibilities: "Full venue access - auto-linked to every service.",
    },
  })
}
