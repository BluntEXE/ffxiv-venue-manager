"use client"

import { useEffect, useState } from "react"
import type { FfxivVenueData } from "@/lib/ffxivvenues"
import { LocalTime } from "@/components/server-time"
import { utcWeeklyToLocal, formatHHMM } from "@/lib/schedule-utils"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

type Props = {
  data: FfxivVenueData
  syncedAt: Date | string
}

export function FfxivvenuesScheduleDisplay({ data, syncedAt }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const schedule = data.schedule ?? []
  const todayDay = mounted ? new Date().getDay() : new Date().getUTCDay()

  const byDay = new Map<number, typeof schedule>()
  for (const entry of schedule) {
    const utcDay = entry.utc?.day ?? entry.day
    const day = mounted ? utcWeeklyToLocal(utcDay, entry.utc.start.hour, entry.utc.start.minute).day : utcDay
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(entry)
  }

  return (
    <div className="dcard">
      <div className="dh">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-4 h-4"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Schedule
        <span className="ml-auto text-[0.7rem] text-[var(--fg-faint)] font-normal">via ffxivvenues.com</span>
      </div>

      {schedule.length === 0 ? (
        <p className="px-5 py-3 text-[0.82rem] text-[var(--fg-faint)]">No schedule published on ffxivvenues.com.</p>
      ) : (
        <>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
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
              let timeStr: string
              if (mounted) {
                const start = utcWeeklyToLocal(utc.day, utc.start.hour, utc.start.minute)
                const startStr = formatHHMM(start.hour, start.minute)
                if (!utc.end) {
                  timeStr = startStr
                } else {
                  const endDay = utc.end.nextDay ? (utc.day + 1) % 7 : utc.day
                  const end = utcWeeklyToLocal(endDay, utc.end.hour, utc.end.minute)
                  timeStr = `${startStr} – ${formatHHMM(end.hour, end.minute)}`
                }
              } else {
                const startStr = formatHHMM(utc.start.hour, utc.start.minute)
                timeStr = utc.end ? `${startStr} – ${formatHHMM(utc.end.hour, utc.end.minute)} ST` : `${startStr} ST`
              }
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
        <span className="text-[0.7rem] text-[var(--fg-faint)]">
          Synced <LocalTime date={syncedAt} formatStr="datetime" />
        </span>
      </div>
    </div>
  )
}
