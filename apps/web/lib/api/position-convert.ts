// xvm-api's PositionModel.color is a Discord-style int (0 to 0xFFFFFF); Prisma's
// Role.color is the "#rrggbb" string every UI color picker in this app already uses.
export function hexColorToInt(hex: string | null): number | null {
  if (hex === null) return null
  const stripped = hex.startsWith("#") ? hex.slice(1) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(stripped)) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  return parseInt(stripped, 16)
}

export function intColorToHex(value: number | null): string | null {
  if (value === null) return null
  return `#${value.toString(16).padStart(6, "0")}`
}

// xvm-api's hourly_rate_minor is an int in minor currency units (cents); Prisma's
// Role.hourlyRate is a Decimal in whole units. Round rather than truncate so a
// fractional cent from float math doesn't silently shave a cent off someone's rate.
export function dollarsToMinorUnits(dollars: number | null): number | null {
  if (dollars === null) return null
  return Math.round(dollars * 100)
}

export function minorUnitsToDollars(minor: number | null): number | null {
  if (minor === null) return null
  return minor / 100
}
