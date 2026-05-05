const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function cleanPendingOwners() {
  // Find pending memberships with OWNER role and no user
  const pendingOwners = await prisma.membership.findMany({
    where: {
      status: 'pending',
      role: 'OWNER',
      userId: null
    }
  })
  
  console.log('Found pending OWNER invites:', pendingOwners.length)
  
  if (pendingOwners.length > 0) {
    const result = await prisma.membership.deleteMany({
      where: {
        status: 'pending',
        role: 'OWNER',
        userId: null
      }
    })
    console.log('Deleted:', result.count, 'records')
  }
  
  await prisma.$disconnect()
}

cleanPendingOwners()
