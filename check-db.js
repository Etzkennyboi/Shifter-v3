const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const players = await prisma.player.findMany({
    orderBy: { bestScore: 'desc' },
    take: 10
  });
  console.log('--- LEADERBOARD IN DB ---');
  console.table(players.map(p => ({
    wallet: p.walletAddress.slice(0, 8),
    bestScore: p.bestScore,
    totalEarned: p.totalEarned
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
