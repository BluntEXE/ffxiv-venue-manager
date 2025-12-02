/**
 * Script to list all users in the database
 * Usage: npx tsx scripts/list-users.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function listUsers() {
  try {
    console.log("\n📋 Listing all users:\n")

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        discordId: true,
        isAdmin: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    if (users.length === 0) {
      console.log("No users found. Make sure someone has logged in at least once.")
      process.exit(0)
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.isAdmin ? "👑" : "👤"} ${user.displayName || user.name || "Unknown"}`)
      console.log(`   Email: ${user.email || "N/A"}`)
      console.log(`   Discord ID: ${user.discordId || "N/A"}`)
      console.log(`   Admin: ${user.isAdmin ? "Yes" : "No"}`)
      console.log(`   Joined: ${user.createdAt.toLocaleDateString()}`)
      console.log()
    })

    console.log(`Total users: ${users.length}`)
    console.log(`Admins: ${users.filter(u => u.isAdmin).length}`)

  } catch (error) {
    console.error("\n❌ Error listing users:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

listUsers()
