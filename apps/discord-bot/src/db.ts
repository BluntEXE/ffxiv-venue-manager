import { Pool } from "pg"

export const db = new Pool({ connectionString: process.env.DATABASE_URL })

export type MembershipRole = "OWNER" | "MANAGER" | "STAFF"

export interface UserMembership {
  displayName: string | null
  name: string
  role: MembershipRole
  venueName: string
}

const ROLE_RANK: Record<MembershipRole, number> = { OWNER: 1, MANAGER: 2, STAFF: 3 }

export async function getHighestMembership(discordId: string): Promise<UserMembership | null> {
  const { rows } = await db.query<UserMembership & { rank: number }>(
    `SELECT u.name, u."displayName", m.role, v.name AS "venueName"
     FROM users u
     JOIN memberships m ON m."userId" = u.id
     JOIN venues v ON m."venueId" = v.id
     WHERE u."discordId" = $1
       AND m.status = 'active'
     ORDER BY CASE m.role WHEN 'OWNER' THEN 1 WHEN 'MANAGER' THEN 2 WHEN 'STAFF' THEN 3 END
     LIMIT 1`,
    [discordId]
  )
  return rows[0] ?? null
}

export async function getAllDiscordIds(): Promise<string[]> {
  const { rows } = await db.query<{ discordId: string }>(
    `SELECT DISTINCT u."discordId" FROM users u WHERE u."discordId" IS NOT NULL`
  )
  return rows.map((r) => r.discordId)
}
