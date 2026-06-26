import type { FfxivVenueData } from "@/lib/ffxivvenues"

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

function formatUtcTime(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM"
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const m = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`
  return `${h}${m} ${period}`
}

type Props = {
  data: FfxivVenueData
  syncedAt: Date | string
}

export function FfxivvenuesScheduleDisplay({ data, syncedAt }: Props) {
  const schedule = data.schedule ?? []
  const todayDay = new Date().getUTCDay()

  const byDay = new Map<number, typeof schedule>()
  for (const entry of schedule) {
    const d = entry.utc?.day ?? entry.day
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d)!.push(entry)
  }

  const syncedDate = new Date(syncedAt)
  const syncLabel = syncedDate.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  }) + " ST"

  return (
    <div className="dcard">
      <div className="dh">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Schedule
        <span className="ml-auto text-[0.7rem] text-[var(--fg-faint)] font-normal">via ffxivvenues.com</span>
      </div>

      {schedule.length === 0 ? (
        <p className="px-5 py-3 text-[0.82rem] text-[var(--fg-faint)]">No schedule published on ffxivvenues.com.</p>
      ) : (
        <>
          {[0,1,2,3,4,5,6].map(i => {
            const entries = byDay.get(i)
            const isToday = i === todayDay
            if (!entries || entries.length === 0) {
              return (
                <div key={i} className={`hours-row closed${isToday ? " today" : ""}`}>
                  <span className="day">{DAY_NAMES[i]}</span>
                  <span className="hrs">—</span>
                </div>
              )
            }
            return entries.map((entry, idx) => {
              const utc = entry.utc
              const startStr = formatUtcTime(utc.start.hour, utc.start.minute)
              const endStr = utc.end ? formatUtcTime(utc.end.hour, utc.end.minute) : null
              const timeStr = endStr ? `${startStr} – ${endStr} ST` : `${startStr} ST`
              return (
                <div key={idx} className={`hours-row${isToday ? " today" : ""}`}>
                  <span className="day">{idx === 0 ? DAY_NAMES[i] : ""}</span>
                  <span className="hrs">{timeStr}</span>
                </div>
              )
            })
          })}
        </>
      )}

      <div className="px-5 py-2 flex items-center justify-between">
        <a
          href={`https://ffxivvenues.com/venue/${data.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.75rem] text-[var(--xiv-blue)] hover:opacity-80 transition-opacity"
        >
          Schedule via ffxivvenues.com →
        </a>
        <span className="text-[0.7rem] text-[var(--fg-faint)]">Synced {syncLabel}</span>
      </div>
    </div>
  )
}
