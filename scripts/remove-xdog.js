const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.task.deleteMany({ where: { id: 'swap_xdog_1' } });
  console.log('Removed swap_xdog_1 task');
  await prisma.$disconnect();
}
main();
