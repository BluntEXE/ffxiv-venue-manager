// FFXIV Data Center → IANA timezone mapping
// All times displayed as "Server Time" (the DC's local timezone)

const DC_TIMEZONES: Record<string, string> = {
  // NA
  Aether: "America/New_York",
  Primal: "America/New_York",
  Crystal: "America/New_York",
  Dynamis: "America/New_York",
  // EU
  Chaos: "Etc/UTC",
  Light: "Etc/UTC",
  // JP
  Elemental: "Asia/Tokyo",
  Gaia: "Asia/Tokyo",
  Mana: "Asia/Tokyo",
  Meteor: "Asia/Tokyo",
  // OCE
  Materia: "Australia/Sydney",
}

export function getServerTimezone(dataCenter: string | null | undefined): string {
  if (!dataCenter) return "Etc/UTC"
  return DC_TIMEZONES[dataCenter] ?? "Etc/UTC"
}

export function getServerTimeLabel(_dataCenter: string | null | undefined): string {
  return "ST"
}
