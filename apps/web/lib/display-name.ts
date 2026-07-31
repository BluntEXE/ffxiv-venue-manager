// apps/web/lib/display-name.ts

/**
 * One resolution order for "what do we call this staff member" everywhere
 * on the site and in Discord webhooks: their FFXIV character (what other
 * players actually know them as) first, then whatever nickname/display
 * name they or their manager set, then their raw Discord OAuth name as a
 * last resort.
 */
export function resolveDisplayName(input: {
  characterName?: string | null
  nickname?: string | null
  displayName?: string | null
  discordName?: string | null
}): string {
  return (
    input.characterName ||
    input.nickname ||
    input.displayName ||
    input.discordName ||
    "Unknown"
  )
}
