import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const ensureRole = async (name: string) => {
  const normalized = name.toLowerCase();
  return prisma.role.upsert({
    where: { name: normalized },
    update: {},
    create: { name: normalized },
  });
};

export const closePrisma = async () => {
  await prisma.$disconnect();
};
