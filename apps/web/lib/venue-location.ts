export const FFXIV_DISTRICTS = [
  "Goblet",
  "Mist",
  "Lavender Beds",
  "Shirogane",
  "Empyreum",
] as const

export type FfxivDistrict = (typeof FFXIV_DISTRICTS)[number]

export interface VenueLocationFields {
  dataCenter: string
  world: string
  district?: string | null
  ward?: number | null
  plot?: number | null
  apartment?: number | null
  location?: string | null
}

/** Returns a formatted "Datacenter · World · District · W# · P#/Apt#" string. Falls back to legacy location text. */
export function formatVenueAddress(v: VenueLocationFields): string {
  const parts: string[] = [v.dataCenter, v.world]

  if (v.district || v.ward || v.plot || v.apartment) {
    if (v.district) parts.push(v.district)
    if (v.ward != null) parts.push(`W${v.ward}`)
    if (v.plot != null) parts.push(`P${v.plot}`)
    else if (v.apartment != null) parts.push(`Apt${v.apartment}`)
  } else if (v.location) {
    parts.push(v.location)
  }

  return parts.join(" · ")
}

/** Pasteable Lifestream `/li` teleport command, e.g. "/li Cactuar Lavender Beds W1 P1". Falls back to the display address if the venue has no structured plot data to build a valid command from. */
export function formatLifestreamCommand(v: VenueLocationFields): string {
  if (!v.district || v.ward == null || (v.plot == null && v.apartment == null)) {
    return formatVenueAddress(v)
  }
  const plotPart = v.plot != null ? `P${v.plot}` : `A${v.apartment}`
  return `/li ${v.world} ${v.district} W${v.ward} ${plotPart}`
}

/** Short location string (district + ward + plot/apartment only, no DC/world). */
export function formatVenueLocationShort(v: Pick<VenueLocationFields, "district" | "ward" | "plot" | "apartment" | "location">): string | null {
  if (v.district || v.ward || v.plot || v.apartment) {
    return [
      v.district ?? null,
      v.ward != null ? `W${v.ward}` : null,
      v.plot != null ? `P${v.plot}` : v.apartment != null ? `Apt${v.apartment}` : null,
    ].filter(Boolean).join(" ") || null
  }
  return v.location ?? null
}
