const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('--- DB CLEANUP INITIATED ---');
    
    // Ordered deletions to respect foreign key constraints
    const tcCount = await prisma.taskCompletion.deleteMany({});
    const wCount = await prisma.withdrawal.deleteMany({});
    const pCount = await prisma.player.deleteMany({});
    const sCount = await prisma.gameSession.deleteMany({});
    
    console.log(`- Deleted ${tcCount.count} Task Completions`);
    console.log(`- Deleted ${wCount.count} Withdrawals`);
    console.log(`- Deleted ${pCount.count} Players`);
    console.log(`- Deleted ${sCount.count} Game Sessions`);
    
    console.log('--- CLEANUP COMPLETE ---');
  } catch (e) {
    console.error('Cleanup error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
