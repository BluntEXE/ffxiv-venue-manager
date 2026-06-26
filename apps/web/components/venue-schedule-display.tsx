import { DAY_NAMES, DAY_SHORT, formatEntryTime, formatIntervalLabel, type ScheduleEntry } from "@/lib/schedule-utils"

type Props = {
  entries: ScheduleEntry[]
  compact?: boolean  // true = short day names, no interval label
}

export function VenueScheduleDisplay({ entries, compact = false }: Props) {
  if (entries.length === 0) {
    return (
      <>
        {[0,1,2,3,4,5,6].map(i => (
          <div key={i} className="hours-row closed">
            <span className="day">{compact ? DAY_SHORT[i] : DAY_NAMES[i]}</span>
            <span className="hrs">—</span>
          </div>
        ))}
        <p className="px-5 pb-3 pt-1 text-[0.72rem] text-[var(--fg-faint)]">Hours not set by owner.</p>
      </>
    )
  }

  const byDay = new Map<number, ScheduleEntry[]>()
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, [])
    byDay.get(e.day)!.push(e)
  }

  const todayDay = new Date().getUTCDay()

  return (
    <>
      {[0,1,2,3,4,5,6].map(i => {
        const dayEntries = byDay.get(i)
        const isToday = i === todayDay
        if (!dayEntries || dayEntries.length === 0) {
          return (
            <div key={i} className={`hours-row closed${isToday ? " today" : ""}`}>
              <span className="day">{compact ? DAY_SHORT[i] : DAY_NAMES[i]}</span>
              <span className="hrs">—</span>
            </div>
          )
        }
        return dayEntries.map((entry, idx) => (
          <div key={entry.id} className={`hours-row${isToday ? " today" : ""}`}>
            <span className="day">{idx === 0 ? (compact ? DAY_SHORT[i] : DAY_NAMES[i]) : ""}</span>
            <span className="hrs">
              {entry.label && <span className="mr-1 text-[var(--fg-faint)] text-[0.78em]">{entry.label} · </span>}
              {formatEntryTime(entry)}
              {!compact && entry.interval !== "WEEKLY" && (
                <span className="ml-1 text-[0.75em] text-[var(--fg-faint)]">({formatIntervalLabel(entry)})</span>
              )}
            </span>
          </div>
        ))
      })}
    </>
  )
}
