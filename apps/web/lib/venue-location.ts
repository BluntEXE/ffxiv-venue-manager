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
  location?: string | null
}

/** Returns a formatted "Datacenter · World · District W# P#" string. Falls back to legacy location text. */
export function formatVenueAddress(v: VenueLocationFields): string {
  const parts: string[] = [v.dataCenter, v.world]

  if (v.district || v.ward || v.plot) {
    const loc = [
      v.district ?? null,
      v.ward  != null ? `W${v.ward}`  : null,
      v.plot  != null ? `P${v.plot}`  : null,
    ].filter(Boolean).join(" ")
    if (loc) parts.push(loc)
  } else if (v.location) {
    parts.push(v.location)
  }

  return parts.join(" · ")
}

/** Short location string (district + ward + plot only, no DC/world). */
export function formatVenueLocationShort(v: Pick<VenueLocationFields, "district" | "ward" | "plot" | "location">): string | null {
  if (v.district || v.ward || v.plot) {
    return [
      v.district ?? null,
      v.ward  != null ? `W${v.ward}`  : null,
      v.plot  != null ? `P${v.plot}`  : null,
    ].filter(Boolean).join(" ") || null
  }
  return v.location ?? null
}
