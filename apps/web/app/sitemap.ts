import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 3600

const BASE = "https://xivvenuemanager.com"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
  })

  const venueEntries: MetadataRoute.Sitemap = venues.map((v) => ({
    url: `${BASE}/venues/${v.slug}`,
    lastModified: v.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }))

  return [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/discover`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/guide/getting-started`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/guide/owner`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/guide/staff`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/stats`, lastModified: new Date(), changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    ...venueEntries,
  ]
}
