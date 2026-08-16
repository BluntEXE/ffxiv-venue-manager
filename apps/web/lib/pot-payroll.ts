import { Prisma } from "../generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>

export type PotRole = "STANDARD" | "POT" | "CONTRACTOR"

export interface PotStaffMember {
  membershipId: string
  potPayoutMode: PotRole
  contractorSharesPot: boolean
  /** Resolved: Membership.tipPooled if set, else VenuePotSettings.defaultTipPooled */
  tipPooled: boolean
  /** True if this member has at least one COMPLETED shift on the event with both actualStart and actualEnd set */
  hasQualifyingShift: boolean
}

export interface PotTransactionInput {
  type: "SALE" | "TIP"
  amount: Decimal
  /** Resolved staff membership id for this transaction, or null for till-level (no staffId) */
  membershipId: string | null
}

export interface PotSettingsInput {
  /** 0-100 */
  taxPercent: Decimal
  includeSalesInPot: boolean
}

export interface PotContractorPayout {
  membershipId: string
  grossSales: Decimal
  payout: Decimal
}

export interface PotDistributionResult {
  regularSales: Decimal
  contractorSales: Decimal
  contractorPayouts: PotContractorPayout[]
  pooledTips: Decimal
  potTotal: Decimal
  recipientMembershipIds: string[]
  recipientCount: number
  perPersonShare: Decimal
  keptTipsByMembership: Map<string, Decimal>
}

export function computePotDistribution(
  staff: PotStaffMember[],
  transactions: PotTransactionInput[],
  settings: PotSettingsInput
): PotDistributionResult {
  const staffById = new Map(staff.map((s) => [s.membershipId, s]))
  const taxRate = settings.taxPercent.dividedBy(100)

  let regularSales = new Decimal(0)
  const contractorSalesByMember = new Map<string, Decimal>()
  let pooledTips = new Decimal(0)
  const keptTipsByMembership = new Map<string, Decimal>()

  for (const t of transactions) {
    if (t.membershipId === null) continue // till-level, no owner to resolve
    const member = staffById.get(t.membershipId)
    if (!member) continue // transaction from staff not in this resolved set

    if (t.type === "SALE") {
      if (member.potPayoutMode === "CONTRACTOR") {
        const prev = contractorSalesByMember.get(t.membershipId) ?? new Decimal(0)
        contractorSalesByMember.set(t.membershipId, prev.plus(t.amount))
      } else if (t.amount.greaterThan(0)) {
        regularSales = regularSales.plus(t.amount)
      }
    } else if (t.type === "TIP") {
      if (member.tipPooled) {
        pooledTips = pooledTips.plus(t.amount)
      } else {
        const prev = keptTipsByMembership.get(t.membershipId) ?? new Decimal(0)
        keptTipsByMembership.set(t.membershipId, prev.plus(t.amount))
      }
    }
  }

  const contractorPayouts: PotContractorPayout[] = []
  let contractorTaxSkim = new Decimal(0)
  let contractorSalesTotal = new Decimal(0)
  for (const [membershipId, grossSales] of contractorSalesByMember) {
    if (grossSales.lessThanOrEqualTo(0)) continue
    contractorSalesTotal = contractorSalesTotal.plus(grossSales)
    contractorTaxSkim = contractorTaxSkim.plus(grossSales.times(taxRate))
    contractorPayouts.push({
      membershipId,
      grossSales,
      payout: grossSales.times(new Decimal(1).minus(taxRate)),
    })
  }

  const potFromRegularSales = settings.includeSalesInPot
    ? regularSales.times(new Decimal(1).minus(taxRate))
    : new Decimal(0)
  const potTotal = potFromRegularSales.plus(contractorTaxSkim).plus(pooledTips)

  const recipientMembershipIds = staff
    .filter(
      (s) =>
        s.hasQualifyingShift &&
        (s.potPayoutMode === "POT" || (s.potPayoutMode === "CONTRACTOR" && s.contractorSharesPot))
    )
    .map((s) => s.membershipId)

  const recipientCount = recipientMembershipIds.length
  const perPersonShare =
    recipientCount > 0 ? potTotal.dividedBy(recipientCount).toDecimalPlaces(0, Decimal.ROUND_DOWN) : new Decimal(0)

  return {
    regularSales,
    contractorSales: contractorSalesTotal,
    contractorPayouts,
    pooledTips,
    potTotal,
    recipientMembershipIds,
    recipientCount,
    perPersonShare,
    keptTipsByMembership,
  }
}
