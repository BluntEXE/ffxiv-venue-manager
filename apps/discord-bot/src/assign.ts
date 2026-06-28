import { GuildMember, Role } from "discord.js"
import { getHighestMembership, type MembershipRole } from "./db.js"

const ROLE_LABEL: Record<MembershipRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
}

// Maps site roles to Discord role names
const DISCORD_ROLE_NAME: Record<MembershipRole | "GUEST", string> = {
  OWNER: "Venue Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
  GUEST: "Community Member",
}

// All role names managed by this bot - used to strip old ones before assigning
const MANAGED_ROLES = new Set(Object.values(DISCORD_ROLE_NAME))

function findRole(member: GuildMember, name: string): Role | undefined {
  return member.guild.roles.cache.find((r) => r.name === name)
}

function abbreviateVenue(name: string): string {
  return name.split(/\s+/).map((w) => w[0].toUpperCase()).join("")
}

function buildNickname(displayName: string, venueName: string, role: MembershipRole): string {
  const fullRole = ROLE_LABEL[role]
  const full = `${displayName} | ${venueName} | ${fullRole}`
  if (full.length <= 32) return full

  // Abbreviate venue to initials (e.g. "The Final Act" → "TFA")
  const short = `${displayName} | ${abbreviateVenue(venueName)} | ${fullRole}`
  if (short.length <= 32) return short

  // Last resort: truncate display name too
  return short.slice(0, 32)
}

export async function assignMember(member: GuildMember): Promise<string> {
  const membership = await getHighestMembership(member.user.id)

  // Strip any previously assigned managed roles
  const toRemove = member.roles.cache.filter((r) => MANAGED_ROLES.has(r.name))
  for (const [, role] of toRemove) {
    await member.roles.remove(role).catch(() => null)
  }

  if (!membership) {
    const guestRole = findRole(member, DISCORD_ROLE_NAME.GUEST)
    if (guestRole) await member.roles.add(guestRole).catch(() => null)
    return `${member.user.username}: no account → Community Member`
  }

  const discordRoleName = DISCORD_ROLE_NAME[membership.role]
  const discordRole = findRole(member, discordRoleName)
  if (discordRole) await member.roles.add(discordRole).catch(() => null)

  const displayName = membership.displayName || membership.name
  const nickname = buildNickname(displayName, membership.venueName, membership.role)

  const isAdmin = member.permissions.has("Administrator") || member.guild.ownerId === member.id
  if (!isAdmin) {
    const nickError = await member.setNickname(nickname).then(() => null).catch((e: Error) => e.message)
    if (nickError) console.warn(`[nick-fail] ${member.user.username} (${member.user.id}): ${nickError}`)
  }

  return `${member.user.username}: ${nickname}${isAdmin ? " (nick skipped - admin)" : ""}`
}
