/**
 * One-time migration: hash existing API keys and mask the stored key field.
 * Run inside the container: npx tsx migrate-api-keys.ts
 *
 * This script:
 * 1. Reads all API keys that still have unhashed (full) keys
 * 2. Computes SHA-256 hash of each key
 * 3. Updates the record: sets keyHash, masks the key field
 */
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

async function main() {
  // Find all keys that haven't been hashed yet (keyHash is null)
  const keys = await prisma.apiKey.findMany({
    where: { keyHash: null },
  })

  console.log(`Found ${keys.length} unhashed API keys`)

  for (const k of keys) {
    // Only hash if the key looks like a full key (not already masked)
    if (!k.key.startsWith('vm_') || k.key.includes('...')) {
      console.log(`  Skipping ${k.id} — already masked or unexpected format`)
      continue
    }

    const keyHash = hashApiKey(k.key)
    const masked = k.key.slice(0, 7) + '...' + k.key.slice(-4)

    await prisma.apiKey.update({
      where: { id: k.id },
      data: { keyHash, key: masked },
    })

    console.log(`  Migrated ${k.id}: ${masked}`)
  }

  console.log('Migration complete')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
