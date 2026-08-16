import prisma from "./prisma.js"

export type MembershipRole = "OWNER" | "MANAGER" | "STAFF"

interface UserMembership {
  displayName: string | null
  name: string
  role: MembershipRole
  venueName: string
}

export const MANAGED_ROLES = ["Venue Owner", "Manager", "Staff", "Community Member"] as const

const ROLE_TO_DISCORD: Record<MembershipRole | "GUEST", string> = {
  OWNER: "Venue Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
  GUEST: "Community Member",
}

const ROLE_LABEL: Record<MembershipRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
}

export async function getHighestMembership(discordId: string): Promise<UserMembership | null> {
  const rows = await prisma.$queryRaw<UserMembership[]>`
    SELECT u.name, u."displayName", m.role, v.name AS "venueName"
    FROM users u
    JOIN memberships m ON m."userId" = u.id
    JOIN venues v ON m."venueId" = v.id
    WHERE u."discordId" = ${discordId}
      AND m.status = 'active'
    ORDER BY CASE m.role WHEN 'OWNER' THEN 1 WHEN 'MANAGER' THEN 2 WHEN 'STAFF' THEN 3 END
    LIMIT 1
  `
  return rows[0] ?? null
}

function abbreviate(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0].toUpperCase())
    .join("")
}

function buildNickname(displayName: string, venueName: string, role: MembershipRole): string {
  const label = ROLE_LABEL[role]
  const full = `${displayName}|${venueName}|${label}`
  if (full.length <= 32) return full
  const short = `${displayName}|${abbreviate(venueName)}|${label}`
  if (short.length <= 32) return short
  return short.slice(0, 32)
}

export async function assignMember(member: import("discord.js").GuildMember): Promise<string> {
  const membership = await getHighestMembership(member.user.id)

  // Strip managed roles
  const toRemove = member.roles.cache.filter((r) => (MANAGED_ROLES as readonly string[]).includes(r.name))
  for (const [, role] of toRemove) await member.roles.remove(role).catch(() => null)

  if (!membership) {
    const guestRole = member.guild.roles.cache.find((r) => r.name === ROLE_TO_DISCORD.GUEST)
    if (guestRole) await member.roles.add(guestRole).catch(() => null)
    return `${member.user.username}: no account → Community Member`
  }

  const discordRoleName = ROLE_TO_DISCORD[membership.role]
  const discordRole = member.guild.roles.cache.find((r) => r.name === discordRoleName)
  if (discordRole) await member.roles.add(discordRole).catch(() => null)

  const displayName = membership.displayName || membership.name
  const nickname = buildNickname(displayName, membership.venueName, membership.role)

  const isAdmin = member.permissions.has("Administrator") || member.guild.ownerId === member.id
  if (!isAdmin) {
    await member.setNickname(nickname).catch((e) => console.warn(`[nick-fail] ${member.user.username}: ${e.message}`))
  }

  return `${member.user.username}: ${nickname}${isAdmin ? " (nick skipped - admin)" : ""}`
}
