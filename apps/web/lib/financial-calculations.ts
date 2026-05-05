import { prisma } from "@/lib/prisma"
import { Decimal } from "@prisma/client/runtime/library"

/**
 * Financial calculation utilities for venue revenue and payroll analysis
 */

export interface FinancialSummary {
  totalRevenue: number
  totalPayroll: number
  netProfit: number
  profitMargin: number // percentage
  payrollAsPercentOfRevenue: number // percentage
}

export interface DateRange {
  startDate: Date
  endDate: Date
}

/**
 * Calculate total revenue from transactions for a venue within a date range
 */
export async function calculateRevenue(
  venueId: string,
  dateRange?: DateRange
): Promise<number> {
  const transactions = await prisma.transaction.findMany({
    where: {
      venueId,
      ...(dateRange && {
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      }),
    },
    select: {
      amount: true,
    },
  })

  return transactions.reduce((sum, t) => sum + Number(t.amount), 0)
}

/**
 * Calculate total payroll expenses for a venue within a date range
 * Only includes PAID payroll entries to reflect actual expenses
 */
export async function calculatePayrollExpenses(
  venueId: string,
  dateRange?: DateRange,
  includePending: boolean = false
): Promise<number> {
  const payrollEntries = await prisma.payrollEntry.findMany({
    where: {
      venueId,
      ...(includePending ? {} : { isPaid: true }),
      ...(dateRange && {
        periodEnd: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      }),
    },
    select: {
      totalAmount: true,
    },
  })

  return payrollEntries.reduce((sum, entry) => sum + Number(entry.totalAmount), 0)
}

/**
 * Calculate net profit (revenue - payroll expenses)
 */
export function calculateNetProfit(revenue: number, payrollExpenses: number): number {
  return revenue - payrollExpenses
}

/**
 * Calculate profit margin as a percentage
 */
export function calculateProfitMargin(revenue: number, netProfit: number): number {
  if (revenue === 0) return 0
  return (netProfit / revenue) * 100
}

/**
 * Calculate payroll as percentage of revenue
 */
export function calculatePayrollPercentage(revenue: number, payrollExpenses: number): number {
  if (revenue === 0) return 0
  return (payrollExpenses / revenue) * 100
}

/**
 * Get comprehensive financial summary for a venue
 */
export async function getFinancialSummary(
  venueId: string,
  dateRange?: DateRange,
  includePendingPayroll: boolean = false
): Promise<FinancialSummary> {
  const [totalRevenue, totalPayroll] = await Promise.all([
    calculateRevenue(venueId, dateRange),
    calculatePayrollExpenses(venueId, dateRange, includePendingPayroll),
  ])

  const netProfit = calculateNetProfit(totalRevenue, totalPayroll)
  const profitMargin = calculateProfitMargin(totalRevenue, netProfit)
  const payrollAsPercentOfRevenue = calculatePayrollPercentage(totalRevenue, totalPayroll)

  return {
    totalRevenue,
    totalPayroll,
    netProfit,
    profitMargin,
    payrollAsPercentOfRevenue,
  }
}

/**
 * Get financial summary for recent events (last N events)
 */
export async function getRecentEventsFinancialSummary(
  venueId: string,
  eventCount: number = 10
): Promise<FinancialSummary> {
  // Get recent events
  const recentEvents = await prisma.event.findMany({
    where: {
      venueId,
      status: {
        in: ["COMPLETED", "ACTIVE"],
      },
    },
    orderBy: {
      startTime: "desc",
    },
    take: eventCount,
    select: {
      id: true,
      startTime: true,
      endTime: true,
    },
  })

  if (recentEvents.length === 0) {
    return {
      totalRevenue: 0,
      totalPayroll: 0,
      netProfit: 0,
      profitMargin: 0,
      payrollAsPercentOfRevenue: 0,
    }
  }

  // Get date range from first to last event
  const startDate = recentEvents[recentEvents.length - 1].startTime
  const endDate = recentEvents[0].endTime || recentEvents[0].startTime

  return getFinancialSummary(venueId, { startDate, endDate }, false)
}
