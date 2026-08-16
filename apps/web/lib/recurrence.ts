import { addWeeks, addMonths } from "date-fns"

export type RecurrenceRule = "WEEKLY" | "BIWEEKLY" | "MONTHLY"

function nextOccurrence(date: Date, rule: RecurrenceRule): Date {
  switch (rule) {
    case "WEEKLY":
      return addWeeks(date, 1)
    case "BIWEEKLY":
      return addWeeks(date, 2)
    case "MONTHLY":
      return addMonths(date, 1)
  }
}

export function generateOccurrences(
  startTime: Date,
  endTime: Date,
  rule: RecurrenceRule,
  count: number
): Array<{ startTime: Date; endTime: Date }> {
  const duration = endTime.getTime() - startTime.getTime()
  const result: Array<{ startTime: Date; endTime: Date }> = []
  let cursor = startTime
  for (let i = 0; i < count; i++) {
    cursor = nextOccurrence(cursor, rule)
    result.push({ startTime: cursor, endTime: new Date(cursor.getTime() + duration) })
  }
  return result
}

// Weeks between one occurrence and the next, per rule. MONTHLY approximated as 4 weeks —
// good enough for sizing a rolling window, not used for actual date math.
const WEEKS_PER_OCCURRENCE: Record<RecurrenceRule, number> = {
  WEEKLY: 1,
  BIWEEKLY: 2,
  MONTHLY: 4,
}

/**
 * How many occurrences of `rule` are needed to cover `windowWeeks` of future time.
 * Used both when first creating a recurring shift (fill a 6-week window) and when the
 * roll-forward cron tops the window back up.
 */
export function occurrencesToFillWindow(rule: RecurrenceRule, windowWeeks: number): number {
  if (windowWeeks <= 0) return 0
  return Math.ceil(windowWeeks / WEEKS_PER_OCCURRENCE[rule])
}
