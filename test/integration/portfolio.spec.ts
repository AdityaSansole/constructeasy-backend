import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { PortfolioService } from '../../src/modules/portfolio/portfolio.service';
import { PortfolioMediaService } from '../../src/modules/portfolio/portfolio-media.service';
import {
  bootstrapTestApp,
  closeTestApp,
} from './helpers';

describe('Portfolio & Media Showcase — integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let moduleRef: any;
  let portfolioService: PortfolioService;
  let mediaService: PortfolioMediaService;

  let localityId: string;

  beforeAll(async () => {
    ({ app, prisma, moduleRef } = await bootstrapTestApp());

    portfolioService = moduleRef.get(PortfolioService);
    mediaService = moduleRef.get(PortfolioMediaService);

    const locality = await prisma.locality.findFirst();
    if (!locality) throw new Error('Integration test requires seeded locality');
    localityId = locality.id;
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

  async function assignRole(userId: string, roleName: string): Promise<void> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new Error(`Role '${roleName}' not seeded`);
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  async function createProfessionalProfile(userId: string, businessName: string, isPublished = false) {
    return prisma.professionalProfile.create({
      data: {
        userId,
        businessName,
        slug: `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        primaryLocalityId: localityId,
        isPublished,
      },
    });
  }

  describe('Portfolio Project CRUD & projectCount Consistency', () => {
    it('creates project, generates unique slug, and increments projectCount', async () => {
      const userId = await createUser('clerk-port-1');
      await assignRole(userId, 'professional');
      const profile = await createProfessionalProfile(userId, 'Luxury Builders', true);

      const p1 = await portfolioService.createProject(userId, ['professional'], {
        title: 'Penthouse Renovation',
        localityId,
        costInr: 5000000,
      });

      expect(p1.slug).toBe('penthouse-renovation');
      expect(p1.professionalId).toBe(profile.id);

      // Verify atomic projectCount incremented to 1
      const updatedProf = await prisma.professionalProfile.findUnique({
        where: { id: profile.id },
      });
      expect(updatedProf?.projectCount).toBe(1);

      // Create duplicate title project -> slug collision handling
      const p2 = await portfolioService.createProject(userId, ['professional'], {
        title: 'Penthouse Renovation',
      });
      expect(p2.slug).toBe('penthouse-renovation-1');

      const updatedProf2 = await prisma.professionalProfile.findUnique({
        where: { id: profile.id },
      });
      expect(updatedProf2?.projectCount).toBe(2);
    });

    it('decrements projectCount on project deletion and cascades media deletion', async () => {
      const userId = await createUser('clerk-port-del');
      await assignRole(userId, 'professional');
      const profile = await createProfessionalProfile(userId, 'Del Builders', true);

      const project = await portfolioService.createProject(userId, ['professional'], {
        title: 'Temporary Villa',
      });

      await mediaService.attachMedia(userId, project.id, {
        fileKey: 'portfolio-media/key.jpg',
        originalFilename: 'key.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2048,
      });

      // Delete project
      await portfolioService.deleteProject(userId, project.id);

      // Verify cascade media deletion
      const mediaCount = await prisma.portfolioMedia.count({
        where: { portfolioProjectId: project.id },
      });
      expect(mediaCount).toBe(0);

      // Verify projectCount decremented
      const updatedProf = await prisma.professionalProfile.findUnique({
        where: { id: profile.id },
      });
      expect(updatedProf?.projectCount).toBe(0);
    });
  });

  describe('Single Cover Image Invariant', () => {
    it('ensures at most one cover image exists per project via atomic replacement', async () => {
      const userId = await createUser('clerk-port-cover');
      await assignRole(userId, 'professional');
      await createProfessionalProfile(userId, 'Cover Builders', true);

      const project = await portfolioService.createProject(userId, ['professional'], {
        title: 'Cover Test Project',
      });

      // Attach first media as cover
      const m1 = await mediaService.attachMedia(userId, project.id, {
        fileKey: 'key/m1.jpg',
        originalFilename: 'm1.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        isCover: true,
      });
      expect(m1.isCover).toBe(true);

      // Attach second media as cover -> unsets m1 cover
      const m2 = await mediaService.attachMedia(userId, project.id, {
        fileKey: 'key/m2.jpg',
        originalFilename: 'm2.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2048,
        isCover: true,
      });
      expect(m2.isCover).toBe(true);

      // Verify m1 is no longer cover in DB
      const m1DB = await prisma.portfolioMedia.findUnique({ where: { id: m1.id } });
      expect(m1DB?.isCover).toBe(false);

      const coverCount = await prisma.portfolioMedia.count({
        where: { portfolioProjectId: project.id, isCover: true },
      });
      expect(coverCount).toBe(1);
    });
  });

  describe('IDOR & Ownership Isolation', () => {
    it('prevents a professional from reading, modifying, or deleting another professional’s project', async () => {
      const u1 = await createUser('clerk-prof-a');
      await assignRole(u1, 'professional');
      await createProfessionalProfile(u1, 'Prof A', true);

      const u2 = await createUser('clerk-prof-b');
      await assignRole(u2, 'professional');
      await createProfessionalProfile(u2, 'Prof B', true);

      const projA = await portfolioService.createProject(u1, ['professional'], {
        title: 'Prof A Project',
      });

      // Prof B attempts to get Prof A's private project -> throws NotFoundException
      await expect(portfolioService.getMyProjectDetail(u2, projA.id)).rejects.toThrow();

      // Prof B attempts to delete Prof A's project -> throws NotFoundException
      await expect(portfolioService.deleteProject(u2, projA.id)).rejects.toThrow();
    });
  });

  describe('Public Showcase Visibility Filtering', () => {
    it('exposes only published projects for published professionals', async () => {
      const userId = await createUser('clerk-pub-prof');
      await assignRole(userId, 'professional');
      const profile = await createProfessionalProfile(userId, 'Public Showcase Arch', true);

      // Create 1 published project, 1 unpublished project
      await portfolioService.createProject(userId, ['professional'], {
        title: 'Published Mansion',
        isPublished: true,
      });

      await portfolioService.createProject(userId, ['professional'], {
        title: 'Secret Draft Mansion',
        isPublished: false,
      });

      const publicList = await portfolioService.listPublicProjects(profile.slug);
      expect(publicList.items.length).toBe(1);
      expect(publicList.items[0].title).toBe('Published Mansion');
    });

    it('hides all projects if the professional profile itself is unpublished', async () => {
      const userId = await createUser('clerk-unpub-prof');
      await assignRole(userId, 'professional');
      const profile = await createProfessionalProfile(userId, 'Unpublished Arch', false); // isPublished = false

      await portfolioService.createProject(userId, ['professional'], {
        title: 'Visible Project Name',
        isPublished: true,
      });

      // Public list throws NotFoundException for unpublished professional profile
      await expect(portfolioService.listPublicProjects(profile.slug)).rejects.toThrow();
    });
  });
});
