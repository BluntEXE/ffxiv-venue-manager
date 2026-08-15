import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"

const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>

export interface ShiftForRateResolution {
  id: string
  roleId: string | null
  actualStart: Date | null
  actualEnd: Date | null
}

interface RateResolvedShift {
  id: string
  hours: Decimal
  rate: Decimal | null // null = no rate could be resolved anywhere in the chain
}

export interface RateResolutionResult {
  resolved: RateResolvedShift[]
  includedShiftIds: string[]
  excludedShiftIds: string[]
  totalHours: Decimal
  totalAmount: Decimal
}

/**
 * Fetches hourlyRate for a set of role IDs, deduplicated. Pass every roleId you might
 * need to look up — shift.roleId values and membership.roleId — collected up front so
 * this runs once per payroll request instead of once per shift.
 */
export async function fetchRoleRates(roleIds: (string | null)[]): Promise<Map<string, Decimal | null>> {
  const uniqueIds = [...new Set(roleIds.filter((id): id is string => id !== null))]
  if (uniqueIds.length === 0) return new Map()

  const roles = await prisma.role.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, hourlyRate: true },
  })
  return new Map(roles.map((r) => [r.id, r.hourlyRate]))
}

/**
 * Resolves a pay rate for each shift, in order: the shift's own tagged role rate,
 * then the person's personal rate, then their primary custom role's rate. Shifts that
 * resolve to no rate anywhere in that chain are excluded from the totals — the caller
 * should leave those shifts unlinked from the payroll entry (payrollEntryId stays null)
 * so they remain eligible for a future run once a rate exists somewhere in the chain.
 */
export function resolveShiftRates(
  shifts: ShiftForRateResolution[],
  membership: { hourlyRate: Decimal | null; roleId: string | null },
  roleRates: Map<string, Decimal | null>
): RateResolutionResult {
  const resolved: RateResolvedShift[] = []
  let totalHours = new Decimal(0)
  let totalAmount = new Decimal(0)

  for (const shift of shifts) {
    if (!shift.actualStart || !shift.actualEnd) {
      // Anomalous data (missing one of the two actual timestamps) — surface it as an
      // unresolved shift (0 hours, no rate) instead of silently dropping it, so it shows
      // up in excludedShiftIds/unresolvedShiftCount rather than vanishing with no trace.
      resolved.push({ id: shift.id, hours: new Decimal(0), rate: null })
      continue
    }

    const hoursRaw = (shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)
    const hours = new Decimal(Math.round(hoursRaw * 100) / 100)

    const shiftRoleRate = shift.roleId ? roleRates.get(shift.roleId) ?? null : null
    const primaryRoleRate = membership.roleId ? roleRates.get(membership.roleId) ?? null : null
    const rate = shiftRoleRate ?? membership.hourlyRate ?? primaryRoleRate ?? null

    resolved.push({ id: shift.id, hours, rate })

    if (rate) {
      totalHours = totalHours.add(hours)
      totalAmount = totalAmount.add(hours.mul(rate))
    }
  }

  return {
    resolved,
    includedShiftIds: resolved.filter((r) => r.rate).map((r) => r.id),
    excludedShiftIds: resolved.filter((r) => !r.rate).map((r) => r.id),
    totalHours,
    totalAmount,
  }
}
