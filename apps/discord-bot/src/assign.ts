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
  const nickname = `${displayName} | ${membership.venueName} | ${ROLE_LABEL[membership.role]}`

  // Setting nickname fails silently for server owner - that's fine
  await member.setNickname(nickname).catch(() => null)

  return `${member.user.username}: ${nickname}`
}
