import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script — Phase 3 Plan Section 6, exact list:
 * countries, one states/cities/localities set for the pilot city, roles,
 * locales, professional_categories, subscription_plans.
 *
 * Idempotent (upsert-based) — safe to re-run in dev/staging.
 * Never seeds fake users/professionals.
 */
async function main(): Promise<void> {
  const india = await prisma.country.upsert({
    where: { isoCode: 'IN' },
    update: {},
    create: { name: 'India', isoCode: 'IN' },
  });

  let maharashtra = await prisma.state.findFirst({ where: { code: 'MH' } });
  if (!maharashtra) {
    maharashtra = await prisma.state.create({
      data: { countryId: india.id, name: 'Maharashtra', code: 'MH' },
    });
  }

  const pune = await prisma.city.upsert({
    where: { slug: 'pune' },
    update: {},
    create: {
      stateId: maharashtra.id,
      name: 'Pune',
      slug: 'pune',
      isActive: true,
      launchedAt: new Date(),
    },
  });

  await prisma.locality.upsert({
    where: { cityId_slug: { cityId: pune.id, slug: 'kothrud' } },
    update: {},
    create: { cityId: pune.id, name: 'Kothrud', slug: 'kothrud' },
  });

  await prisma.locality.upsert({
    where: { cityId_slug: { cityId: pune.id, slug: 'viman-nagar' } },
    update: {},
    create: { cityId: pune.id, name: 'Viman Nagar', slug: 'viman-nagar' },
  });

  const roles = ['homeowner', 'professional', 'verification_admin', 'content_admin', 'super_admin'];
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const locales = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'mr', name: 'Marathi' },
  ];
  for (const locale of locales) {
    await prisma.locale.upsert({
      where: { code: locale.code },
      update: {},
      create: locale,
    });
  }

  const categories = [
    { name: 'Architect', slug: 'architect' },
    { name: 'Interior Designer', slug: 'interior-designer' },
    { name: 'Contractor', slug: 'contractor' },
    { name: 'Builder', slug: 'builder' },
  ];
  for (const category of categories) {
    await prisma.professionalCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  const existingFree = await prisma.subscriptionPlan.findFirst({ where: { name: 'free' } });
  if (!existingFree) {
    await prisma.subscriptionPlan.create({
      data: { name: 'free', pricePaise: 0, billingInterval: 'monthly' },
    });
  }

  const existingPremium = await prisma.subscriptionPlan.findFirst({ where: { name: 'premium' } });
  if (!existingPremium) {
    await prisma.subscriptionPlan.create({
      data: { name: 'premium', pricePaise: 49900, billingInterval: 'monthly' },
    });
  }

  console.log('Batch 1 seed complete: country, state, city, localities, roles, locales, categories, plans.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
