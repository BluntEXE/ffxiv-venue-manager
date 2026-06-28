/**
 * One-shot script: classify existing venues by type using Hermes LiteLLM.
 * Run: npx tsx scripts/backfill-venue-types.ts
 */
import { PrismaClient } from "../apps/web/generated/prisma/client"

const prisma = new PrismaClient()

const HERMES_URL = "http://192.168.1.253:4000"
const MODEL = "deepseek/deepseek-chat"

const VALID_TYPES = [
  "BAR_TAVERN", "NIGHTCLUB", "LOUNGE", "HOST_CLUB",
  "CABARET", "BATHHOUSE", "CASINO", "STUDIO", "OTHER", "TEST_VENUE",
] as const

type VenueType = typeof VALID_TYPES[number]

async function classify(name: string, description: string | null): Promise<VenueType> {
  const prompt = `Classify this FFXIV RP venue into exactly one of these categories:
BAR_TAVERN, NIGHTCLUB, LOUNGE, HOST_CLUB, CABARET, BATHHOUSE, CASINO, STUDIO, OTHER, TEST_VENUE

- BAR_TAVERN: bars, taverns, inns, pubs
- NIGHTCLUB: clubs, dance venues, DJ nights, music events
- LOUNGE: lounges, upscale relaxed spaces, chill bars
- HOST_CLUB: host/hostess clubs where you pay for company/conversation
- CABARET: cabaret shows, adult entertainment, strip clubs
- BATHHOUSE: bathhouses, spas, onsen, relaxation venues
- CASINO: casino gaming, gambling, card games
- STUDIO: GPose studios, photography studios, creative spaces
- TEST_VENUE: clearly a test/placeholder ("testing", "work in progress", no real description)
- OTHER: anything that doesn't clearly fit

Venue name: ${name}
Description: ${description ?? "(none)"}

Reply with ONLY the category name, nothing else.`

  const res = await fetch(`${HERMES_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
      temperature: 0,
    }),
  })

  if (!res.ok) throw new Error(`LLM error: ${res.status}`)
  const json = await res.json()
  const raw = (json.choices?.[0]?.message?.content ?? "").trim().toUpperCase().replace(/[^A-Z_]/g, "")
  return VALID_TYPES.includes(raw as VenueType) ? (raw as VenueType) : "OTHER"
}

async function main() {
  const venues = await prisma.venue.findMany({
    where: { venueType: null },
    select: { id: true, name: true, description: true },
    orderBy: { name: "asc" },
  })

  console.log(`Classifying ${venues.length} venues...`)

  for (const v of venues) {
    const type = await classify(v.name, v.description)
    await prisma.venue.update({ where: { id: v.id }, data: { venueType: type } })
    console.log(`  ${v.name.padEnd(24)} → ${type}`)
  }

  console.log("Done.")
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
