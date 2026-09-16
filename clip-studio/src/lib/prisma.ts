import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// show-upload-progress: Submission.uploadedBytes/totalBytes are BigInt
// (files observed well over Int's ~2.1GB ceiling - see schema.prisma
// comment). JSON.stringify throws on a raw BigInt by default; every route
// that returns a Submission already imports this module (for `prisma`
// itself), so patching serialization here once covers all of them instead
// of repeating a mapper in each route. Stringifying (not Number(...)) keeps
// values exact past Number.MAX_SAFE_INTEGER.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
BigInt.prototype.toJSON = function () {
  return this.toString();
};

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
