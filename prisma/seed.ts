/**
 * Seed script — Phase 3 Plan Section 6.
 *
 * No models exist yet in Batch 0 (schema.prisma has connection/generator
 * config only). Real seed data (countries, Maharashtra state/city/locality
 * set, roles, locales, professional_categories, subscription_plans) is
 * added in Batch 1 (Locations & Lookups), per the frozen plan's explicit
 * seed-data list. This file is scaffolded now so `npm run prisma:seed`
 * has a valid, idempotent entry point from the start rather than being
 * introduced mid-batch.
 */
async function main(): Promise<void> {
  console.log(
    'No seed data defined yet — models arrive starting Batch 1 (Locations & Lookups).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
