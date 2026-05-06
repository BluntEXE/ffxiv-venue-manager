// Server Time = UTC always (FFXIV Earth Server Time)
export function formatST(date: Date | string, kind: 'time' | 'datetime' | 'timeShort' = 'time'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'UTC' }

  if (kind === 'time') {
    return d.toLocaleTimeString('en-US', { ...opts, hour: 'numeric', minute: '2-digit', hour12: true })
  }
  if (kind === 'timeShort') {
    return d.toLocaleTimeString('en-US', { ...opts, hour: 'numeric', minute: '2-digit', hour12: true })
  }
  return d.toLocaleString('en-US', { ...opts, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

export function formatOpenSince(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m ago`
}

export function formatUntil(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const mins = Math.floor((d.getTime() - Date.now()) / 60000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  return `in ${hrs}h ${mins % 60}m`
}
