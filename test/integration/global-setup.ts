import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../../prisma/seed';
import { applyIntegrationTestEnvDefaults } from './helpers';

/**
 * Runs once before any integration suite. Ensures canonical Batch 1 lookup
 * data exists via the shared prisma/seed.ts script (idempotent upserts).
 */
export default async function globalSetup(): Promise<void> {
  applyIntegrationTestEnvDefaults();

  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
