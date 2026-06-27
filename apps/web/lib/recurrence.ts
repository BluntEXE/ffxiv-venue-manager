import { addWeeks, addMonths } from "date-fns"

export type RecurrenceRule = "WEEKLY" | "BIWEEKLY" | "MONTHLY"

function nextOccurrence(date: Date, rule: RecurrenceRule): Date {
  switch (rule) {
    case "WEEKLY":   return addWeeks(date, 1)
    case "BIWEEKLY": return addWeeks(date, 2)
    case "MONTHLY":  return addMonths(date, 1)
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
