// One-time backfill: push existing venues' current Prisma profile-field
// values (name, description, banner, logo, district, ward, plot->room) into
// xvm-api, for venues connected before Task 1 shipped and whose xvm-api
// profile has never been touched since createVenue seeded only
// name/data_center/world. Run once, manually, via `tsx backfill-venue-profile.js`
// from apps/web (pass --dry-run to report without writing). Idempotent per
// field, not per venue: progress is tracked in a local JSON file
// (backfill-venue-profile.progress.json, gitignored) recording which venues
// have already been pushed, so a re-run only retries venues that failed or
// haven't been attempted - same pattern as backfill-gallery-images.js.
//
// Note: this repo's schema.prisma emits a TS-native client to
// ../generated/prisma (not the classic @prisma/client default location), and
// requires the same driver-adapter wiring as lib/prisma.ts. Run this script
// with `tsx`, not plain `node` - tsx resolves the .ts client import; plain
// node's CJS loader cannot. Progress is machine-local - a re-run from a
// different box has no memory of a prior run's successes there.
const fs = require("fs")
const path = require("path")
const { PrismaPg } = require("@prisma/adapter-pg")
const { Pool } = require("pg")
const { PrismaClient } = require("./generated/prisma/client")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const XVM_API_BASE_URL = process.env.XVM_API_BASE_URL
if (!XVM_API_BASE_URL) {
  console.error("XVM_API_BASE_URL is not set")
  process.exit(1)
}

const DRY_RUN = process.argv.includes("--dry-run")
const PROGRESS_FILE = path.join(__dirname, "backfill-venue-profile.progress.json")

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"))
  } catch {
    return {}
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

async function updateVenue(token, xvmApiVenueId, data) {
  const res = await fetch(`${XVM_API_BASE_URL}/venues/${xvmApiVenueId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`updateVenue ${res.status}: ${await res.text()}`)
  return res.json()
}

async function backfill() {
  const venues = await prisma.venue.findMany({
    where: { xvmApiVenueId: { not: null } },
    select: {
      id: true, slug: true, xvmApiVenueId: true,
      name: true, description: true, bannerUrl: true, logoUrl: true,
      district: true, ward: true, plot: true, apartment: true,
      memberships: {
        where: { role: { in: ["OWNER", "MANAGER"] }, status: "active" },
        select: { userId: true },
      },
    },
  })

  console.log(`Found ${venues.length} xvm-api-connected venue(s).`)
  if (DRY_RUN) console.log("--dry-run: no writes will actually happen.\n")

  const progress = loadProgress()
  const results = { migrated: [], skippedAlreadyDone: [], skippedNoToken: [], failures: [] }

  for (const venue of venues) {
    if (progress[venue.id]) {
      results.skippedAlreadyDone.push(venue.slug)
      continue
    }

    let token = null
    for (const m of venue.memberships) {
      const row = await prisma.xvmApiCredential.findUnique({ where: { userId: m.userId } })
      if (row && row.expiresAt.getTime() - Date.now() > 24 * 60 * 60 * 1000) {
        token = row.token
        break
      }
    }
    if (!token) {
      results.skippedNoToken.push(venue.slug)
      continue
    }

    const data = {
      name: venue.name,
      description: venue.description,
      banner_url: venue.bannerUrl,
      logo_url: venue.logoUrl,
      district: venue.district,
      ward: venue.ward,
      plot: venue.plot,
      room: venue.apartment,
    }

    if (DRY_RUN) {
      results.migrated.push(venue.slug)
      continue
    }

    try {
      await updateVenue(token, venue.xvmApiVenueId, data)
      progress[venue.id] = true
      saveProgress(progress)
      results.migrated.push(venue.slug)
    } catch (err) {
      results.failures.push({ slug: venue.slug, error: String(err) })
    }
  }

  console.log("\n=== Backfill report ===")
  console.log(`Migrated: ${results.migrated.length}`, results.migrated)
  console.log(`Already done (skipped): ${results.skippedAlreadyDone.length}`, results.skippedAlreadyDone)
  console.log(`No valid manager token (skipped): ${results.skippedNoToken.length}`, results.skippedNoToken)
  console.log(`Failures: ${results.failures.length}`)
  for (const f of results.failures) console.log(`  ${f.slug}: ${f.error}`)
}

backfill()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
