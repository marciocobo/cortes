import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 moved connection config out of schema.prisma - the client now
// takes a driver adapter instead of reading `url` from the datasource
// block (see prisma/schema.prisma comment history / prisma7.config.ts).
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse a single PrismaClient across hot reloads in dev (avoids exhausting
// Postgres connections), matching the standard Next.js + Prisma pattern.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
