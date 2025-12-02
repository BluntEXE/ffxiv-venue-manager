import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanup() {
  console.log('🧹 Cleaning up production database...')

  try {
    // Delete all data (cascading deletes will handle relations)
    const deleted = await prisma.venue.deleteMany({})

    console.log(`✅ Deleted ${deleted.count} venues and all related data`)
    console.log('✨ Database is now clean!')
  } catch (error) {
    console.error('❌ Error cleaning database:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

cleanup()
