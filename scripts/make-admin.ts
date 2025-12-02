/**
 * Script to grant admin privileges to a user
 * Usage: npx tsx scripts/make-admin.ts <email_or_discord_id>
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function makeAdmin() {
  const identifier = process.argv[2]

  if (!identifier) {
    console.error("❌ Error: Please provide an email or Discord ID")
    console.log("\nUsage:")
    console.log("  npx tsx scripts/make-admin.ts <email_or_discord_id>")
    console.log("\nExamples:")
    console.log("  npx tsx scripts/make-admin.ts user@example.com")
    console.log("  npx tsx scripts/make-admin.ts 123456789012345678")
    process.exit(1)
  }

  try {
    console.log(`\n🔍 Looking for user: ${identifier}`)

    // Try to find user by email or Discord ID
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { discordId: identifier },
        ],
      },
    })

    if (!user) {
      console.error(`\n❌ Error: No user found with email or Discord ID: ${identifier}`)
      console.log("\nTip: Make sure the user has logged in at least once")
      process.exit(1)
    }

    if (user.isAdmin) {
      console.log(`\n✅ User is already an admin:`)
      console.log(`   Name: ${user.displayName || user.name}`)
      console.log(`   Email: ${user.email}`)
      console.log(`   Discord ID: ${user.discordId}`)
      process.exit(0)
    }

    // Update user to admin
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true },
    })

    console.log(`\n✅ Successfully granted admin privileges!`)
    console.log(`   Name: ${updatedUser.displayName || updatedUser.name}`)
    console.log(`   Email: ${updatedUser.email}`)
    console.log(`   Discord ID: ${updatedUser.discordId}`)
    console.log(`\n🎉 You can now access the admin panel at: /admin/feedback`)

  } catch (error) {
    console.error("\n❌ Error making user admin:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

makeAdmin()
