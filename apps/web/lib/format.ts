/**
 * Format a gil amount for compact display: millions get an "m" suffix
 * once the value crosses 999,000 (1.0m+), otherwise thousands get a "k"
 * suffix above 999, and small amounts are shown as-is. Does not include
 * the "gil" unit - use formatGil() for that, or pair this with a
 * separately-rendered unit label.
 */
export function formatGilCompact(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}m`
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}k`
  }
  return `${amount}`
}

/**
 * Same as formatGilCompact, but with the "gil" unit appended.
 */
export function formatGil(amount: number): string {
  return `${formatGilCompact(amount)} gil`
}
