const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany();
  console.log(JSON.stringify(tasks, null, 2));
  await prisma.$disconnect();
}
main();
