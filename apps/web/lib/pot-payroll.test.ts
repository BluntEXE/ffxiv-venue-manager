import { describe, it, expect } from "vitest"
import { Prisma } from "../generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>
import { computePotDistribution, type PotStaffMember, type PotTransactionInput } from "./pot-payroll"

function staff(overrides: Partial<PotStaffMember> & { membershipId: string }): PotStaffMember {
  return {
    potPayoutMode: "STANDARD",
    contractorSharesPot: false,
    tipPooled: false,
    hasQualifyingShift: true,
    ...overrides,
  }
}

function tx(overrides: Partial<PotTransactionInput>): PotTransactionInput {
  return {
    type: "SALE",
    amount: new Decimal(0),
    membershipId: null,
    ...overrides,
  }
}

describe("computePotDistribution", () => {
  it("splits regular sales pot evenly among POT-role recipients, minus tax", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT" }),
      staff({ membershipId: "m2", potPayoutMode: "POT" }),
    ]
    const transactions = [
      tx({ type: "SALE", amount: new Decimal(1000), membershipId: "m1" }),
      tx({ type: "SALE", amount: new Decimal(1000), membershipId: "m2" }),
    ]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(10),
      includeSalesInPot: true,
    })

    expect(result.regularSales.toNumber()).toBe(2000)
    expect(result.potTotal.toNumber()).toBe(1800) // 2000 * 0.9
    expect(result.recipientCount).toBe(2)
    expect(result.perPersonShare.toNumber()).toBe(900)
  })

  it("does not double-count contractor gross: pot only gets the tax skim", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT" }),
      staff({ membershipId: "c1", potPayoutMode: "CONTRACTOR", contractorSharesPot: false }),
    ]
    const transactions = [tx({ type: "SALE", amount: new Decimal(500), membershipId: "c1" })]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(20),
      includeSalesInPot: true,
    })

    // pot gets ONLY the tax (100), not the 500 gross
    expect(result.potTotal.toNumber()).toBe(100)
    expect(result.contractorPayouts).toEqual([
      { membershipId: "c1", grossSales: expect.objectContaining({}), payout: expect.objectContaining({}) },
    ])
    expect(result.contractorPayouts[0].payout.toNumber()).toBe(400) // 500 * 0.8
    // contractor did not opt to share, so pot has 1 recipient (m1) even though c1 has a qualifying shift
    expect(result.recipientCount).toBe(1)
  })

  it("ignores non-positive SALE amounts (e.g. a refund/correction) when accumulating regularSales", () => {
    const staffList = [staff({ membershipId: "m1", potPayoutMode: "POT" })]
    const transactions = [
      tx({ type: "SALE", amount: new Decimal(500), membershipId: "m1" }),
      tx({ type: "SALE", amount: new Decimal(-200), membershipId: "m1" }), // refund/correction
      tx({ type: "SALE", amount: new Decimal(0), membershipId: "m1" }),
    ]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(0),
      includeSalesInPot: true,
    })

    expect(result.regularSales.toNumber()).toBe(500)
    expect(result.potTotal.toNumber()).toBe(500)
  })

  it("includes a contractor as a pot recipient only when contractorSharesPot is true", () => {
    const staffList = [staff({ membershipId: "c1", potPayoutMode: "CONTRACTOR", contractorSharesPot: true })]
    const transactions = [tx({ type: "SALE", amount: new Decimal(100), membershipId: "c1" })]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(10),
      includeSalesInPot: true,
    })

    expect(result.recipientCount).toBe(1)
    expect(result.perPersonShare.toNumber()).toBe(10) // pot = 100 * 0.1 tax skim only
  })

  it("splits pooled tips into the pot and keeps unpooled tips with the individual", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT", tipPooled: true }),
      staff({ membershipId: "m2", potPayoutMode: "STANDARD", tipPooled: false }),
    ]
    const transactions = [
      tx({ type: "TIP", amount: new Decimal(50), membershipId: "m1" }),
      tx({ type: "TIP", amount: new Decimal(30), membershipId: "m2" }),
      tx({ type: "TIP", amount: new Decimal(999), membershipId: null }), // till-level, excluded
    ]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(0),
      includeSalesInPot: false,
    })

    expect(result.pooledTips.toNumber()).toBe(50)
    expect(result.keptTipsByMembership.get("m2")?.toNumber()).toBe(30)
    expect(result.keptTipsByMembership.has("m1")).toBe(false)
  })

  it("excludes staff without a qualifying shift from recipients", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT", hasQualifyingShift: true }),
      staff({ membershipId: "m2", potPayoutMode: "POT", hasQualifyingShift: false }), // no-show
    ]
    const transactions = [tx({ type: "SALE", amount: new Decimal(200), membershipId: "m1" })]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(0),
      includeSalesInPot: true,
    })

    expect(result.recipientCount).toBe(1)
    expect(result.recipientMembershipIds).toEqual(["m1"])
  })

  it("writes a zero-recipient distribution rather than dropping it", () => {
    const result = computePotDistribution([], [tx({ type: "SALE", amount: new Decimal(100), membershipId: null })], {
      taxPercent: new Decimal(0),
      includeSalesInPot: true,
    })

    expect(result.recipientCount).toBe(0)
    expect(result.potTotal.toNumber()).toBe(0) // no staff resolved for the sale, so it's dropped from regularSales
    expect(result.perPersonShare.toNumber()).toBe(0)
  })

  it("does not redistribute the rounding remainder; it stays with the venue", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT" }),
      staff({ membershipId: "m2", potPayoutMode: "POT" }),
      staff({ membershipId: "m3", potPayoutMode: "POT" }),
    ]
    const transactions = [tx({ type: "SALE", amount: new Decimal(100), membershipId: "m1" })]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(0),
      includeSalesInPot: true,
    })

    // 100 / 3 = 33.33... -> floor to 33 per person, 1 gil stays with the venue
    expect(result.perPersonShare.toNumber()).toBe(33)
  })
})
