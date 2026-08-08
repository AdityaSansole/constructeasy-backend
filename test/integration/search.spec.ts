import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { SearchService } from '../../src/modules/search/search.service';
import { RedisService, RedisNamespace } from '../../src/infrastructure/redis/redis.service';
import { VerificationLevel } from '@prisma/client';
import { SearchProfessionalsDto } from '../../src/modules/search/dto/search-professionals.dto';
import {
  bootstrapTestApp,
  closeTestApp,
} from './helpers';

describe('Search & Discovery — integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let moduleRef: any;
  let searchService: SearchService;

  let localityId: string;
  let categoryId: string;
  let categorySlug: string;

  let redisService: RedisService;

  beforeAll(async () => {
    ({ app, prisma, moduleRef } = await bootstrapTestApp());
    searchService = moduleRef.get(SearchService);
    redisService = moduleRef.get(RedisService);

    const locality = await prisma.locality.findFirst({ include: { city: true } });
    if (!locality) throw new Error('Integration test requires seeded locality');
    localityId = locality.id;

    const category = await prisma.professionalCategory.findFirst();
    if (!category) throw new Error('Integration test requires seeded category');
    categoryId = category.id;
    categorySlug = category.slug;
  });

  beforeEach(async () => {
    await redisService.invalidatePattern(RedisNamespace.Cache, '*');
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE portfolio_media, portfolio_projects, verification_history, verification_documents, verification_records, professional_category_map, service_areas, professional_profiles, homeowner_profiles, webhook_events, user_roles, admin_users, users RESTART IDENTITY CASCADE`;
    await closeTestApp(app, moduleRef);
  });

  async function createUser(clerkUserId: string): Promise<string> {
    const user = await prisma.user.create({
      data: { clerkUserId, email: `${clerkUserId}@test.com` },
    });
    return user.id;
  }

  async function createProfessional(
    clerkId: string,
    businessName: string,
    verificationLevel: VerificationLevel,
    isPublished = true,
  ) {
    const userId = await createUser(clerkId);
    const profile = await prisma.professionalProfile.create({
      data: {
        userId,
        businessName,
        slug: `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        primaryLocalityId: localityId,
        verificationLevel,
        isPublished,
      },
    });

    await prisma.professionalCategoryMap.create({
      data: {
        professionalId: profile.id,
        categoryId,
      },
    });

    return profile;
  }

  describe('Trust-First Ranking & Filtering', () => {
    it('ranks level_2 professionals above level_1 and unverified professionals', async () => {
      const pUnverified = await createProfessional('clerk-unv', 'Alpha Unverified', VerificationLevel.unverified, true);
      const pL2 = await createProfessional('clerk-l2', 'Beta Level 2', VerificationLevel.level_2, true);
      const pL1 = await createProfessional('clerk-l1', 'Gamma Level 1', VerificationLevel.level_1, true);

      const results = await searchService.searchProfessionals(new SearchProfessionalsDto());
      const foundIds = results.items.map((i) => i.id);

      const idxL2 = foundIds.indexOf(pL2.id);
      const idxL1 = foundIds.indexOf(pL1.id);
      const idxUnv = foundIds.indexOf(pUnverified.id);

      expect(idxL2).toBeLessThan(idxL1);
      expect(idxL1).toBeLessThan(idxUnv);
    });

    it('filters professionals by category slug', async () => {
      const res = await searchService.searchProfessionals(
        Object.assign(new SearchProfessionalsDto(), { category: categorySlug }),
      );
      expect(res.items.length).toBeGreaterThan(0);
      expect(res.items.every((item) => item.categories.some((c) => c.slug === categorySlug))).toBe(true);
    });

    it('excludes unpublished professionals from search results', async () => {
      const draftProf = await createProfessional('clerk-draft', 'Draft Studio', VerificationLevel.level_1, false);

      const res = await searchService.searchProfessionals(
        Object.assign(new SearchProfessionalsDto(), { q: 'Draft Studio' }),
      );
      const found = res.items.find((i) => i.id === draftProf.id);
      expect(found).toBeUndefined();
    });
  });

  describe('Comparison & Detail APIs', () => {
    it('compares 2 to 4 unique professionals side by side', async () => {
      const p1 = await createProfessional('clerk-cmp-1', 'Comp Arch 1', VerificationLevel.level_1, true);
      const p2 = await createProfessional('clerk-cmp-2', 'Comp Arch 2', VerificationLevel.level_2, true);

      const res = await searchService.compareProfessionals({ identifiers: [p1.id, p2.id] });
      expect(res.length).toBe(2);
      expect(res.some((r) => r.id === p1.id)).toBe(true);
      expect(res.some((r) => r.id === p2.id)).toBe(true);
    });

    it('returns whitelisted public profile detail by slug', async () => {
      const prof = await createProfessional('clerk-detail', 'Detail Arch', VerificationLevel.level_2, true);

      const detail = await searchService.getPublicProfessionalDetail(prof.slug);
      expect(detail.id).toBe(prof.id);
      expect(detail.businessName).toBe('Detail Arch');
      expect(detail.verificationLevel).toBe('level_2');
      expect((detail as any).userId).toBeUndefined();
    });
  });
});
