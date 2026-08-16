export type GrandCompany = "MAELSTROM" | "TWIN_ADDER" | "IMMORTAL_FLAMES"

const GC_PREFIXES: Record<GrandCompany, string> = {
  MAELSTROM: "Storm",
  TWIN_ADDER: "Serpent",
  IMMORTAL_FLAMES: "Flame",
}

export const GC_LABELS: Record<GrandCompany, string> = {
  MAELSTROM: "Maelstrom",
  TWIN_ADDER: "Order of the Twin Adder",
  IMMORTAL_FLAMES: "Immortal Flames",
}

export const GC_EMOJI: Record<GrandCompany, string> = {
  MAELSTROM: "🌊",
  TWIN_ADDER: "🐍",
  IMMORTAL_FLAMES: "🔥",
}

// Direct XP thresholds for each rank tier.
// Calibrated for: 10 XP/msg at 60s cooldown (~100 XP/day casual chat).
// Platform hooks (patron visits, shifts) add more, so engaged members climb faster.
export const RANK_THRESHOLDS: { xp: number; suffix: string }[] = [
  { xp: 0, suffix: "Private Third Class" },
  { xp: 1_000, suffix: "Private Second Class" },
  { xp: 4_000, suffix: "Private First Class" },
  { xp: 10_000, suffix: "Corporal" },
  { xp: 22_000, suffix: "Sergeant Third Class" },
  { xp: 42_000, suffix: "Sergeant Second Class" },
  { xp: 75_000, suffix: "Sergeant First Class" },
  { xp: 120_000, suffix: "Chief Sergeant" },
  { xp: 180_000, suffix: "Second Lieutenant" },
  { xp: 260_000, suffix: "First Lieutenant" },
  { xp: 375_000, suffix: "Captain" },
]

export const MESSAGE_XP = 10

export function rankForXp(xp: number, gc?: GrandCompany | null): { name: string; emoji: string; index: number } {
  let result = RANK_THRESHOLDS[0]
  let index = 0
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (xp >= RANK_THRESHOLDS[i].xp) {
      result = RANK_THRESHOLDS[i]
      index = i
    } else break
  }
  const prefix = gc ? GC_PREFIXES[gc] : "Flame"
  const emoji = gc ? GC_EMOJI[gc] : "🔥"
  return { name: `${prefix} ${result.suffix}`, emoji, index }
}

export function nextRankThreshold(xp: number): { xp: number; suffix: string } | null {
  for (const tier of RANK_THRESHOLDS) {
    if (tier.xp > xp) return tier
  }
  return null
}

// Level is purely cosmetic — a slow-climbing prestige number derived from XP.
export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 100)))
}

export const LOYALTY_TIERS = [
  { visits: 150, label: "🥇 Gold Patron" },
  { visits: 50, label: "🥈 Silver Patron" },
  { visits: 10, label: "🥉 Bronze Patron" },
] as const

export function loyaltyTier(visits: number): string | null {
  for (const tier of LOYALTY_TIERS) {
    if (visits >= tier.visits) return tier.label
  }
  return null
}
