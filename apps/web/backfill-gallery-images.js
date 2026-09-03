// One-time backfill: migrate existing venues' Prisma-stored gallery image URLs
// (old xiv-venues MinIO bucket) into xvm-api's own image storage. Run once,
// manually, via `tsx backfill-gallery-images.js` from apps/web (pass --dry-run
// to report what would happen without uploading anything). Non-destructive:
// does not touch Prisma's Venue.galleryImages or delete anything from the old
// bucket, so it's safe to inspect results before any later cleanup.
//
// Idempotent per image, not per venue: progress is tracked in a local JSON
// file (backfill-gallery-images.progress.json, gitignored), recording exactly
// which source URLs have already been uploaded. A re-run after a partial
// failure only retries the URLs that didn't succeed last time - it can't
// duplicate images, and it isn't fooled by new uploads through the live UI
// changing xvm-api's image count for a venue.
//
// Note: this repo's schema.prisma emits a TS-native client to ../generated/prisma
// (not the classic @prisma/client default location), and requires the same
// driver-adapter wiring as lib/prisma.ts. Run this script with `tsx`, not plain
// `node` — tsx resolves the .ts client import; plain node's CJS loader cannot.
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
const PROGRESS_FILE = path.join(__dirname, "backfill-gallery-images.progress.json")

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

async function uploadVenueImage(token, xvmApiVenueId, blob, filename) {
  const form = new FormData()
  form.append("file", blob, filename)
  const res = await fetch(`${XVM_API_BASE_URL}/venues/${xvmApiVenueId}/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`)
  return res.json()
}

async function backfill() {
  const venues = await prisma.venue.findMany({
    where: { xvmApiVenueId: { not: null }, galleryImages: { isEmpty: false } },
    select: { id: true, slug: true, xvmApiVenueId: true, galleryImages: true, memberships: {
      where: { role: { in: ["OWNER", "MANAGER"] }, status: "active" },
      select: { userId: true },
    } },
  })

  console.log(`Found ${venues.length} venue(s) with a Prisma gallery and an xvm-api link.`)
  if (DRY_RUN) console.log("--dry-run: no uploads will actually happen.\n")

  const progress = loadProgress()
  const results = { migrated: [], skippedNoToken: [], skippedAlreadyDone: [], partialFailures: [] }

  for (const venue of venues) {
    const done = progress[venue.id] ?? {}
    const remaining = venue.galleryImages.filter((url) => !done[url])
    if (remaining.length === 0) {
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

    if (DRY_RUN) {
      results.migrated.push({ slug: venue.slug, count: remaining.length, total: venue.galleryImages.length })
      continue
    }

    let migratedCount = 0
    for (const url of remaining) {
      try {
        const imgRes = await fetch(url)
        if (!imgRes.ok) throw new Error(`fetch old image ${imgRes.status}`)
        const blob = await imgRes.blob()
        const filename = url.split("/").pop() || "image"
        await uploadVenueImage(token, venue.xvmApiVenueId, blob, filename)
        migratedCount++
        done[url] = true
        progress[venue.id] = done
        saveProgress(progress)
      } catch (err) {
        results.partialFailures.push({ slug: venue.slug, step: `upload ${url}`, error: String(err) })
      }
    }
    results.migrated.push({ slug: venue.slug, count: migratedCount, total: venue.galleryImages.length })
  }

  console.log("\n=== Backfill report ===")
  console.log(`Migrated: ${results.migrated.length}`)
  for (const m of results.migrated) console.log(`  ${m.slug}: ${m.count}/${m.total} images`)
  console.log(`Already done (skipped): ${results.skippedAlreadyDone.length}`, results.skippedAlreadyDone)
  console.log(`No valid manager token (skipped): ${results.skippedNoToken.length}`, results.skippedNoToken)
  console.log(`Partial failures: ${results.partialFailures.length}`)
  for (const f of results.partialFailures) console.log(`  ${f.slug} (${f.step}): ${f.error}`)
}

backfill()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
